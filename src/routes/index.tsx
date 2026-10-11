import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { streamImage } from "@/lib/stream-image";
import { buildPrompt, MASTER_PRESET, RATIOS, type Ratio, type Texture } from "@/lib/preset";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CD STUDIO — Fotografía de producto con IA" },
      { name: "description", content: "Transforma tus portadiscos impresos en 3D en fotografías de catálogo profesionales." },
      { property: "og:title", content: "CD STUDIO — Fotografía de producto con IA" },
      { property: "og:description", content: "Transforma tus portadiscos en fotografías de catálogo." },
    ],
  }),
  component: Studio,
});

type Slot = "front" | "iso" | "album";
type GalleryItem = { id: string; src: string; product: string; album: string; ratio: Ratio; size: string; date: number };

const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: "front", label: "Vista frontal del portadisco", hint: "Forma, proporciones y texto" },
  { key: "iso", label: "Vista isométrica del portadisco", hint: "Ranura superior y profundidad" },
  { key: "album", label: "Portada del álbum", hint: "Imagen cuadrada" },
];
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIN_SIDE = 400;

function readDims(file: File) {
  return new Promise<{ w: number; h: number; url: string }>((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight, url });
    img.onerror = () => rej(new Error("No se pudo leer la imagen"));
    img.src = url;
  });
}

function UploadCard({ label, hint, preview, error, onFile }: { label: string; hint: string; preview?: string | undefined; error?: string | undefined; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-card transition ${over ? "border-foreground" : "border-border hover:border-foreground/40"}`}
    >
      <div className="relative aspect-square w-full bg-muted">
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-contain p-3" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-xl">+</span>
            <span className="text-xs">Arrastra o haz clic · JPG, PNG, WEBP</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-medium">{label}</p>
        <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{error ?? hint}</p>
      </div>
      <input ref={ref} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-foreground";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-input bg-muted p-1">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${value === o.v ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Studio() {
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({});
  const [product, setProduct] = useState("Portadisco CD");
  const [album, setAlbum] = useState("");
  const [frontText, setFrontText] = useState("");
  const [color, setColor] = useState("#1A1A1A");
  const [texture, setTexture] = useState<Texture>("sutil");
  const [bg, setBg] = useState<"white" | "transparent">("white");
  const [ratio, setRatio] = useState<Ratio>("1:1");
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string>();
  const [result, setResult] = useState<{ src: string; final: boolean; ratio: Ratio }>();
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => { get<GalleryItem[]>("cd-gallery").then((g) => g && setGallery(g)); }, []);

  async function onFile(slot: Slot, f: File) {
    if (!TYPES.includes(f.type)) return setErrors((e) => ({ ...e, [slot]: "Formato no válido. Usa JPG, PNG o WEBP." }));
    try {
      const { w, h, url } = await readDims(f);
      if (Math.min(w, h) < MIN_SIDE) return setErrors((e) => ({ ...e, [slot]: `Muy pequeña (${w}×${h}). Mínimo ${MIN_SIDE}px por lado.` }));
      if (slot === "album" && Math.abs(w / h - 1) > 0.05) return setErrors((e) => ({ ...e, [slot]: `La portada debe ser cuadrada (${w}×${h}).` }));
      setErrors((e) => ({ ...e, [slot]: undefined }));
      setFiles((p) => ({ ...p, [slot]: f }));
      setPreviews((p) => ({ ...p, [slot]: url }));
    } catch (err) {
      setErrors((e) => ({ ...e, [slot]: (err as Error).message }));
    }
  }

  const missing = SLOTS.filter((s) => !files[s.key]).map((s) => s.label);
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(color);
  const ready = missing.length === 0 && hexOk && frontText.trim().length > 0;

  async function generate() {
    if (!ready || busy) return;
    setBusy(true); setGenError(undefined); setSaved(false); setResult(undefined);
    const r = ratio;
    const form = new FormData();
    form.append("prompt", buildPrompt({ frontText: frontText.trim(), color, texture, transparent: bg === "transparent", albumTitle: album.trim(), locked }));
    form.append("image[]", files.front!);
    form.append("image[]", files.iso!);
    form.append("image[]", files.album!);
    form.append("size", RATIOS[r].size);
    form.append("quality", "high");
    if (bg === "transparent") { form.append("background", "transparent"); form.append("output_format", "png"); }
    try {
      await streamImage("/api/edit-image", form, (src, final) => setResult({ src, final, ratio: r }));
    } catch (e) {
      const msg = (e as Error).message;
      setGenError(
        msg.includes("402") ? "No quedan créditos de IA disponibles. Recarga créditos en tu espacio de trabajo e inténtalo de nuevo."
        : msg.includes("429") ? "Demasiadas solicitudes. Espera un momento y vuelve a intentarlo."
        : msg.includes("403") ? "El servicio rechazó esta solicitud. Revisa que las imágenes no infrinjan las políticas de contenido."
        : `No se pudo generar la fotografía. ${msg.slice(0, 200)}`,
      );
      setResult(undefined);
    } finally { setBusy(false); }
  }

  async function saveToGallery() {
    if (!result?.final) return;
    const item: GalleryItem = { id: crypto.randomUUID(), src: result.src, product, album, ratio: result.ratio, size: RATIOS[result.ratio].size, date: Date.now() };
    const next = [item, ...gallery];
    setGallery(next); await set("cd-gallery", next); setSaved(true);
  }

  function download(src: string, fmt: "png" | "jpg") {
    const name = `${(product || "cd-studio").replace(/\s+/g, "-").toLowerCase()}${album ? "-" + album.replace(/\s+/g, "-").toLowerCase() : ""}`;
    if (fmt === "png") { const a = document.createElement("a"); a.href = src; a.download = `${name}.png`; a.click(); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
      const a = document.createElement("a"); a.href = c.toDataURL("image/jpeg", 0.95); a.download = `${name}.jpg`; a.click();
    };
    img.src = src;
  }

  const aspect = { "1:1": "aspect-square", "4:5": "aspect-[4/5]", "3:4": "aspect-[3/4]" }[result?.ratio ?? ratio];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CD STUDIO</h1>
            <p className="text-sm text-muted-foreground">Transforma tus portadiscos en fotografías de catálogo.</p>
          </div>
          <span className="hidden rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground sm:block">Preset · {MASTER_PRESET.id}</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_minmax(0,480px)]">
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">01 · Referencias</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {SLOTS.map((s) => (
                <UploadCard key={s.key} label={s.label} hint={s.hint} preview={previews[s.key]} error={errors[s.key]} onFile={(f) => onFile(s.key, f)} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">02 · Configuración del producto</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del producto"><input className={inputCls} value={product} onChange={(e) => setProduct(e.target.value)} /></Field>
              <Field label="Título del álbum"><input className={inputCls} value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="Ej. Kind of Blue" /></Field>
              <Field label="Texto frontal"><input className={inputCls} value={frontText} onChange={(e) => setFrontText(e.target.value)} placeholder="Texto en relieve del portadisco" /></Field>
              <Field label="Color del portadisco">
                <div className="flex gap-2">
                  <input type="color" value={hexOk ? color : "#000000"} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-input bg-card p-1" />
                  <input className={`${inputCls} flex-1 font-mono uppercase ${hexOk ? "" : "border-destructive"}`} value={color} onChange={(e) => setColor(e.target.value)} maxLength={7} />
                </div>
              </Field>
              <Field label="Textura de impresión 3D">
                <Seg value={texture} onChange={setTexture} options={[{ v: "sutil", l: "Sutil" }, { v: "media", l: "Media" }, { v: "pronunciada", l: "Pronunciada" }]} />
              </Field>
              <Field label="Fondo">
                <Seg value={bg} onChange={setBg} options={[{ v: "white", l: "Blanco" }, { v: "transparent", l: "Transparente" }]} />
              </Field>
              <Field label="Formato de salida">
                <Seg value={ratio} onChange={setRatio} options={(Object.keys(RATIOS) as Ratio[]).map((r) => ({ v: r, l: `${r} · ${RATIOS[r].label}` }))} />
              </Field>
              <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2 sm:mt-5">
                <div>
                  <p className="text-sm font-medium">Bloquear estilo de catálogo</p>
                  <p className="text-xs text-muted-foreground">Misma cámara, luz y encuadre siempre</p>
                </div>
                <button type="button" role="switch" aria-checked={locked} onClick={() => setLocked(!locked)} className={`relative h-6 w-11 rounded-full transition ${locked ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-card transition-all ${locked ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          </section>

          {gallery.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Generaciones anteriores</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {gallery.map((g) => (
                  <button key={g.id} type="button" onClick={() => setResult({ src: g.src, final: true, ratio: g.ratio })} className="overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-foreground/40" title={`${g.product} · ${g.album}`}>
                    <img src={g.src} alt={g.album || g.product} className="aspect-square w-full object-cover" />
                    <p className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">{g.album || g.product}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">03 · Resultado</h2>
          <div className={`relative w-full overflow-hidden rounded-2xl border border-border shadow-card ${aspect} ${bg === "transparent" ? "checker" : "bg-card"}`}>
            {result ? (
              <img src={result.src} alt="Fotografía generada" className={`h-full w-full object-contain transition-[filter] duration-500 ${result.final ? "blur-0" : "blur-2xl"}`} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                {busy ? (
                  <>
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                    <p className="text-sm">Componiendo la escena en el estudio…</p>
                    <p className="text-xs">Puede tardar hasta un minuto.</p>
                  </>
                ) : (
                  <p className="text-sm">Tu fotografía aparecerá aquí.</p>
                )}
              </div>
            )}
            {busy && result && !result.final && (
              <span className="absolute bottom-3 left-3 rounded-full bg-card px-3 py-1 text-xs font-medium shadow-card">Refinando detalles…</span>
            )}
          </div>

          {!ready && !busy && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {missing.map((m) => <li key={m}>· Falta: {m}</li>)}
              {!frontText.trim() && <li>· Falta: texto frontal</li>}
              {!hexOk && <li className="text-destructive">· Color HEX no válido</li>}
            </ul>
          )}
          {genError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{genError}</p>}

          <button type="button" disabled={!ready || busy} onClick={generate} className="h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? "Generando…" : result ? "Generar de nuevo" : "Generar fotografía"}
          </button>

          {result?.final && !busy && (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => download(result.src, "png")} className="h-10 rounded-lg border border-input bg-card text-xs font-medium hover:border-foreground">Descargar PNG</button>
              <button type="button" onClick={() => download(result.src, "jpg")} className="h-10 rounded-lg border border-input bg-card text-xs font-medium hover:border-foreground">Descargar JPG</button>
              <button type="button" disabled={saved} onClick={saveToGallery} className="h-10 rounded-lg border border-input bg-card text-xs font-medium hover:border-foreground disabled:opacity-50">{saved ? "Guardado" : "Guardar en galería"}</button>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Resolución real: {RATIOS[result?.ratio ?? ratio].size.replace("x", " × ")} px (no es 4K nativo). La IA usa tus referencias como guía; la geometría puede no ser exacta al píxel.
          </p>
        </aside>
      </main>
    </div>
  );
}
