// workers/router/index.js

import orchestratorHandler from '../orchestrator/index.js';
import apiHandler from '../api/api-handler.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Si la ruta es para la API de música, delega al apiHandler
        if (path.startsWith('/spotify') || path.startsWith('/radioparadise')) {
            return apiHandler.fetch(request, env, ctx);
        }

        // Para cualquier otra ruta (como peticiones manuales), podrías
        // devolver una respuesta genérica o delegar al orquestador si tuviera un handler fetch.
        // Como el orquestador solo maneja eventos 'scheduled', aquí no hacemos nada.
        return new Response('This worker handles API requests and scheduled events.', { status: 200 });
    },

    // El evento programado lo maneja directamente el orquestador
    async scheduled(event, env, ctx) {
        return orchestratorHandler.scheduled(event, env, ctx);
    }
};
