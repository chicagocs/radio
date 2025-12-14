// workers/router/index.js

import apiHandler from '../api/api-handler.js';
import orchestratorHandler from '../orchestrator/index.js';

export default {
    // Maneja todas las peticiones HTTP (fetch)
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Si la ruta es para la API de música, delega al apiHandler
        if (path.startsWith('/spotify') || path.startsWith('/radioparadise')) {
            return apiHandler.fetch(request, env, ctx);
        }
        
        // Servir archivos estáticos desde el namespace ASSETS
        if (env.ASSETS) {
            try {
                return await env.ASSETS.fetch(request);
            } catch (err) {
                // SPA fallback: siempre servir index.html si no se encuentra el archivo
                return await env.ASSETS.fetch(new Request("/index.html", request));
            }
        }

        return new Response("Not Found", { status: 404 });
    },

    // Maneja los eventos programados (scheduled)
    async scheduled(event, env, ctx) {
        console.log("Router: Received scheduled event, delegating to orchestrator.");
        // Delega la lógica del backup al orquestador
        return orchestratorHandler.scheduled(event, env, ctx);
    }
};
