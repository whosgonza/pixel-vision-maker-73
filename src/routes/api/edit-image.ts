import { createFileRoute } from "@tanstack/react-router";
import { editImage } from "@/lib/image-gateway.server";

const ALLOWED_SIZES = new Set(["2048x2048", "2048x2560", "2304x3072"]);

export const Route = createFileRoute("/api/edit-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Falta configurar la clave del servicio de imágenes", { status: 500 });
        const form = await request.formData();
        const images = form.getAll("image[]");
        if (images.length !== 3) return new Response("Se requieren 3 imágenes de referencia", { status: 400 });
        const size = String(form.get("size") ?? "");
        if (!ALLOWED_SIZES.has(size)) form.set("size", "2048x2048");
        const upstream = await editImage(apiKey, form);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
