import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  CloudArrowUp,
  MagnifyingGlass,
  FileText,
  FilePdf,
  FileXls,
  FileDoc,
  Trash,
  Tag,
  Detective,
  Database,
  WarningCircle,
  Star,
} from "@phosphor-icons/react";

function FileIcon({ filetype }) {
  const cls = "w-8 h-8";
  if (filetype === "pdf") return <FilePdf className={cls} weight="fill" style={{ color: "#FF3B30" }} />;
  if (["xlsx", "xls", "csv"].includes(filetype)) return <FileXls className={cls} weight="fill" style={{ color: "#22c55e" }} />;
  if (["docx", "doc"].includes(filetype)) return <FileDoc className={cls} weight="fill" style={{ color: "#0055FF" }} />;
  return <FileText className={cls} weight="fill" style={{ color: "#64748b" }} />;
}

function FormatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocCard({ doc, onDelete, onSetModel, canSetModel }) {
  const meta = doc.metadata || {};
  const ling = meta.linguistic_patterns || {};
  const struct = meta.structure || {};

  return (
    <div className="card-lift bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <FileIcon filetype={doc.filetype} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {doc.filetype?.toUpperCase()} · {FormatSize(meta.file_size_bytes || 0)} ·{" "}
            {new Date(doc.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <button
          onClick={() => onDelete(doc.id)}
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Remover"
        >
          <Trash className="w-4 h-4" />
        </button>
      </div>

      {doc.is_model ? (
        <span className="inline-flex items-center gap-1 text-xs bg-[#0055FF]/10 text-[#0055FF] px-2 py-1 rounded-full w-fit font-semibold">
          <Star className="w-3 h-3" weight="fill" /> Ata-modelo do RPPS
        </span>
      ) : canSetModel && ["docx", "pdf", "txt"].includes(doc.filetype) ? (
        <button
          onClick={() => onSetModel(doc.id)}
          className="inline-flex items-center gap-1 text-xs border border-slate-200 text-slate-600 px-2 py-1 rounded-full w-fit hover:border-[#0055FF] hover:text-[#0055FF] transition-colors"
        >
          <Star className="w-3 h-3" /> Usar como ata-modelo
        </button>
      ) : null}

      {meta.is_brasao_candidate && (
        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full w-fit">
          <Tag className="w-3 h-3" /> Brasão / Logotipo
        </span>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        {ling.estimated_formality != null && (
          <div className="bg-slate-50 rounded-lg p-2">
            <span className="text-slate-400 block mb-0.5">Formalidade</span>
            <span className="font-semibold text-slate-700">{ling.estimated_formality}/100</span>
          </div>
        )}
        {ling.word_count != null && (
          <div className="bg-slate-50 rounded-lg p-2">
            <span className="text-slate-400 block mb-0.5">Palavras</span>
            <span className="font-semibold text-slate-700">{ling.word_count?.toLocaleString("pt-BR")}</span>
          </div>
        )}
        {ling.formal_marker_count != null && (
          <div className="bg-slate-50 rounded-lg p-2">
            <span className="text-slate-400 block mb-0.5">Marcadores</span>
            <span className="font-semibold text-slate-700">{ling.formal_marker_count} encontrados</span>
          </div>
        )}
        {struct.section_count != null && (
          <div className="bg-slate-50 rounded-lg p-2">
            <span className="text-slate-400 block mb-0.5">Seções</span>
            <span className="font-semibold text-slate-700">{struct.section_count}</span>
          </div>
        )}
      </div>

      {meta.text_preview && (
        <p className="text-xs text-slate-400 line-clamp-2 italic border-t border-slate-50 pt-2">
          "{meta.text_preview.slice(0, 140)}…"
        </p>
      )}
    </div>
  );
}

function UploadZone({ onUpload, uploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    Array.from(files).forEach((f) => onUpload(f));
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 transition-all cursor-pointer
        ${dragging ? "border-[#0055FF] bg-[#0055FF]/5" : "border-slate-200 hover:border-[#0055FF]/40 hover:bg-slate-50"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragging ? "bg-[#0055FF]" : "bg-slate-100"}`}>
        <CloudArrowUp className={`w-8 h-8 ${dragging ? "text-white" : "text-slate-400"}`} weight="bold" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-slate-700">
          {uploading ? "Processando documentos…" : "Arraste arquivos ou clique para selecionar"}
        </p>
        <p className="text-sm text-slate-400 mt-1">DOCX (ata-modelo), PDF, XLSX, CSV, TXT · Máx. 20 MB por arquivo</p>
      </div>
      {uploading && (
        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#0055FF] animate-pulse rounded-full w-2/3" />
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const canSetModel = ["admin", "superadmin"].includes(user?.role);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["kb", search],
    queryFn: async () => {
      const url = search.length >= 2 ? `/kb/search?q=${encodeURIComponent(search)}` : "/kb";
      const r = await api.get(url);
      return r.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { await api.delete(`/kb/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb"] }),
  });

  const setModel = async (id) => {
    try {
      await api.post(`/kb/${id}/set-model`);
      toast.success("Ata-modelo atualizada. As próximas atas seguirão este padrão.");
      qc.invalidateQueries({ queryKey: ["kb"] });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Não foi possível definir a ata-modelo");
    }
  };

  const handleUpload = async (file) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/kb/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      qc.invalidateQueries({ queryKey: ["kb"] });
    } catch (err) {
      setUploadErrors((prev) => [...prev, `Erro ao carregar "${file.name}": ${err.response?.data?.detail || err.message}`]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 fade-up">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-[#0055FF]/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-[#0055FF]" weight="fill" />
          </div>
          <div>
            <p className="label-eyebrow">ATAS RPPS</p>
            <h1 className="text-2xl font-bold text-slate-800">Base de Conhecimento</h1>
          </div>
        </div>
        <p className="text-slate-500 text-sm mt-2">
          Envie a ata-modelo do seu RPPS em DOCX: a IA passa a escrever no mesmo padrão e a exportação usa o próprio arquivo,
          preservando cabeçalho, rodapé e brasão. Outros documentos (atas anteriores, resoluções) também podem ser guardados aqui.
        </p>
      </div>

      <div className="mb-6">
        <UploadZone onUpload={handleUpload} uploading={uploading} />
      </div>

      {uploadErrors.length > 0 && (
        <div className="mb-4 space-y-2">
          {uploadErrors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              <span>{e}</span>
              <button onClick={() => setUploadErrors((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-600">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="relative mb-6">
        <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou conteúdo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]/30 focus:border-[#0055FF] bg-white transition-all"
        />
      </div>

      <div className="flex items-center gap-6 mb-6 text-sm">
        <span className="text-slate-500">
          <span className="font-semibold text-slate-800">{docs.length}</span> documento{docs.length !== 1 ? "s" : ""}
          {search ? ` encontrado${docs.length !== 1 ? "s" : ""}` : " na base"}
        </span>
        {docs.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-600">
            <Detective className="w-4 h-4" weight="fill" />
            Agente ativo e aprendendo
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-white border border-slate-100 shimmer" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Database className="w-8 h-8 text-slate-300" weight="fill" />
          </div>
          <div>
            <p className="font-semibold text-slate-500">
              {search ? "Nenhum documento encontrado" : "Base de conhecimento vazia"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {search ? "Tente outros termos de busca." : "Carregue atas e documentos institucionais para começar."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} onDelete={(id) => deleteMutation.mutate(id)} onSetModel={setModel} canSetModel={canSetModel} />
          ))}
        </div>
      )}
    </div>
  );
}
