"""Indicadores econômicos (API SGS do Banco Central), com cache em memória.

Correções em relação à versão herdada do ATA:
- Nunca devolve valores inventados quando a fonte falha (antes: Selic 13,75,
  Ibovespa 125.000 etc., rotulados como "BCB"). Agora o indicador vem com
  value=None e available=False, para não contaminar uma ata oficial.
- IPCA usa a série 13522 (acumulado em 12 meses). A série 433 é a variação
  MENSAL e fazia o cálculo de juro real sair errado.
- CDI (série 12) é diário; agora é anualizado (base 252) antes de exibir.
- Poupança (série 196) é mensal e passou a ser rotulada como % a.m.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_CACHE: dict[str, dict] = {}
_CACHE_TTL = timedelta(hours=4)

BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados/ultimos/{n}?formato=json"
IBOV_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=5d&interval=1d"

SERIES = {
    "selic_meta": 432,    # Meta Selic (% a.a.)
    "ipca_12m": 13522,    # IPCA acumulado 12 meses (%)
    "ipca_mensal": 433,   # IPCA variação mensal (%)
    "cdi_diario": 12,     # CDI (% a.d.)
    "dolar_venda": 1,     # Dólar PTAX venda (R$)
    "poupanca": 196,      # Poupança, rentabilidade mensal (% a.m.)
}

DISCLAIMER = ("Leitura automática e simplificada do cenário, para apoiar a discussão do comitê. "
              "Não constitui recomendação de investimento.")


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and datetime.now(timezone.utc) - entry["ts"] < _CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data) -> None:
    _CACHE[key] = {"data": data, "ts": datetime.now(timezone.utc)}


async def _fetch_series(code: int, n: int = 1) -> Optional[list[dict]]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(BCB_URL.format(code=code, n=n))
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("BCB indisponível (série %s): %s", code, exc)
        return None


def _parse(items: Optional[list[dict]]) -> list[dict]:
    out = []
    for item in items or []:
        try:
            out.append({"date": item["data"], "value": float(str(item["valor"]).replace(",", "."))})
        except (KeyError, ValueError, TypeError):
            continue
    return out


async def _latest(code: int) -> Optional[dict]:
    points = _parse(await _fetch_series(code, 1))
    return points[-1] if points else None


async def _fetch_ibovespa() -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
            resp = await client.get(IBOV_URL)
            resp.raise_for_status()
            meta = resp.json()["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice") or meta.get("previousClose")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        if not price:
            return None
        return {"value": round(price, 2), "change_pct": round((price - prev) / prev * 100, 2) if prev else None}
    except Exception as exc:
        logger.warning("Ibovespa indisponível: %s", exc)
        return None


def _indicator(label: str, unit: str, source: str, point: Optional[dict], value=None) -> dict:
    val = value if value is not None else (point or {}).get("value")
    return {"label": label, "unit": unit, "source": source, "value": val,
            "reference_date": (point or {}).get("date"), "available": val is not None}


async def get_economic_indicators() -> dict:
    cached = _cache_get("indicators")
    if cached:
        return cached
    selic, ipca, cdi, dolar, poup, ibov = await asyncio.gather(
        _latest(SERIES["selic_meta"]), _latest(SERIES["ipca_12m"]), _latest(SERIES["cdi_diario"]),
        _latest(SERIES["dolar_venda"]), _latest(SERIES["poupanca"]), _fetch_ibovespa(),
    )
    cdi_annual = round(((1 + cdi["value"] / 100) ** 252 - 1) * 100, 2) if cdi else None
    indicators = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "selic": _indicator("Meta Selic", "% a.a.", "BCB/SGS 432", selic),
        "ipca": _indicator("IPCA (12 meses)", "%", "BCB/SGS 13522", ipca),
        "cdi": _indicator("CDI (anualizado)", "% a.a.", "BCB/SGS 12", cdi, cdi_annual),
        "dolar": _indicator("Dólar (PTAX venda)", "R$", "BCB/SGS 1", dolar),
        "poupanca": _indicator("Poupança", "% a.m.", "BCB/SGS 196", poup),
        "ibovespa": {"label": "Ibovespa", "unit": "pts", "source": "Yahoo Finance (não oficial)",
                     "value": (ibov or {}).get("value"), "change_pct": (ibov or {}).get("change_pct"),
                     "available": ibov is not None},
    }
    # Só guarda em cache se as séries principais vieram, para tentar de novo logo após uma falha.
    if indicators["selic"]["available"] and indicators["ipca"]["available"]:
        _cache_set("indicators", indicators)
    return indicators


async def _history(key: str, code: int, months: int) -> list[dict]:
    cache_key = f"{key}_{months}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    points = _parse(await _fetch_series(code, months))
    if points:
        _cache_set(cache_key, points)
    return points


async def get_selic_history(months: int = 12) -> list[dict]:
    return await _history("selic", SERIES["selic_meta"], months)


async def get_ipca_history(months: int = 12) -> list[dict]:
    """Variação mensal do IPCA, para gráfico."""
    return await _history("ipca", SERIES["ipca_mensal"], months)


def generate_scenario_analysis(selic: Optional[float], ipca: Optional[float]) -> dict:
    """Leitura qualitativa simples baseada no juro real (Selic meta − IPCA 12m)."""
    if not selic or ipca is None:
        return {"scenario": "indisponivel", "real_rate": None, "selic_used": selic, "ipca_used": ipca,
                "guidance": "Indicadores do Banco Central indisponíveis no momento.", "disclaimer": DISCLAIMER}
    real_rate = selic - ipca
    if real_rate > 6:
        scenario, guidance = "juro_real_muito_alto", (
            "Juro real muito elevado: títulos pós-fixados e prefixados oferecem prêmio alto em relação à inflação.")
    elif real_rate > 3:
        scenario, guidance = "juro_real_alto", (
            "Juro real em patamar alto: ambiente favorável à renda fixa, com espaço para diversificação moderada.")
    elif real_rate > 0:
        scenario, guidance = "juro_real_moderado", (
            "Juro real moderado: relevante avaliar a aderência da carteira à meta atuarial.")
    else:
        scenario, guidance = "juro_real_negativo", (
            "Juro real negativo: atenção à corrosão do patrimônio frente à inflação.")
    return {"scenario": scenario, "real_rate": round(real_rate, 2), "guidance": guidance,
            "selic_used": selic, "ipca_used": ipca, "disclaimer": DISCLAIMER}
