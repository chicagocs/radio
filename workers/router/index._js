// workers/router/index.js
// Este es el cerebro de la aplicación. Recibe todas las peticiones y las dirige al módulo correcto.

import orchestratorHandler from '../orchestrator/index.js';
import apiHandler from '../api/api-handler.js';

export default {
    /**
     * Maneja todas las peticiones HTTP (fetch) que llegan al Worker.
     * @param {Request} request - El objeto de la petición entrante.
     * @param {Env} env - El objeto de entorno con las variables y KV namespaces.
     * @param {ExecutionContext} ctx - El contexto de ejecución.
     * @returns {Promise<Response>} La respuesta a la petición.
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // 1. Enrutamiento a la API de música
        if (path.startsWith('/spotify') || path.startsWith('/radioparadise')) {
            return apiHandler.fetch(request, env, ctx);
        }
        
        // 2. Disparador Secreto para Pruebas Manuales
        const secretTriggerPath = '/secret-trigger-backup-12345';
        if (path === secretTriggerPath) {
            console.log("🔥 Backup disparado MANUALMENTE via URL secreta.");
            // ¡CAMBIO! Llamamos a nuestra nueva función centralizada que maneja errores.
            return this.handleScheduledTask(request, env, ctx);
        }
        
        // 3. Servir Archivos Estáticos (SPA)
        if (env.ASSETS) {
            try {
                return await env.ASSETS.fetch(request);
            } catch (err) {
                console.log(`Asset not found for ${path}, serving index.html fallback.`);
                return await env.ASSETS.fetch(new Request("/index.html", request));
            }
        }

        // 4. Respuesta 404 para todo lo demás
        return new Response("Not Found", { status: 404 });
    },

    /**
     * Maneja los eventos programados (cron jobs).
     * @param {ScheduledEvent} event - El objeto del evento programado.
     * @param {Env} env - El objeto de entorno.
     * @param {ExecutionContext} ctx - El contexto de ejecución.
     */
    async scheduled(event, env, ctx) {
        console.log("⏰ Backup disparado por el CRON programado.");
        // ¡CAMBIO! Llamamos a nuestra nueva función centralizada que maneja errores.
        return this.handleScheduledTask(event, env, ctx);
    },

    // =================================================================
    // ¡NUEVAS FUNCIONES A PARTIR DE AQUÍ!
    // =================================================================

    /**
     * Función centralizada para ejecutar la tarea principal y manejar fallos.
     * @param {ScheduledEvent|Request} trigger - El objeto que disparó la tarea (cron o manual).
     * @param {Env} env - El objeto de entorno.
     * @param {ExecutionContext} ctx - El contexto de ejecución.
     */
    async handleScheduledTask(trigger, env, ctx) {
        try {
            // Delega toda la lógica del backup al módulo orquestador.
            await orchestratorHandler.scheduled(trigger, env, ctx);
            console.log("✅ Tarea programada finalizada con éxito.");
            // En un evento scheduled, la respuesta no se envía a nadie,
            // pero es buena práctica devolver una.
            return new Response("Tarea completada", { status: 200 });
        } catch (error) {
            // ¡Algo salió mal! Aquí capturamos CUALQUIER error de la tarea principal.
            console.error("❌ Error crítico en la tarea programada:", error);
            // Llamamos a la función que enviará la alerta.
            await this.sendFailureAlert(error, env);
            // Devolvemos una respuesta de error, pero controlada.
            return new Response("Tarea programada fallida", { status: 500 });
        }
    },

    /**
     * Llama al worker de alertas para notificar del fallo.
     * @param {Error} error - El error capturado.
     * @param {Env} env - El objeto de entorno que contiene el binding al worker de alertas.
     */
    async sendFailureAlert(error, env) {
        // El nombre 'ALERTER_WORKER' viene del wrangler.toml que acabamos de modificar.
        const alerter = env.ALERTER_WORKER;
        if (!alerter) {
            console.error("❌ No se encontró el binding 'ALERTER_WORKER'. No se puede enviar la alerta.");
            return;
        }

        const alertPayload = {
            subject: `🚨 Fallo en Worker: ${env.WORKER_NAME || 'core'}`,
            // Usamos error.stack para obtener un detalle completo del error, incluyendo la línea donde ocurrió.
            message: `La tarea programada ha fallado con el siguiente error:\n\n${error.stack}`,
            timestamp: new Date().toISOString(),
        };

        try {
            // Hacemos una petición interna a nuestro otro worker ('alerter-worker').
            // La URL puede ser cualquiera, ya que es una llamada interna.
            const alertResponse = await alerter.fetch(new Request('https://alerter-worker/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(alertPayload),
            }));

            if (!alertResponse.ok) {
                console.error("❌ El worker de alertas devolvió un error:", alertResponse.status, alertResponse.statusText);
            } else {
                console.log("✅ Solicitud de alerta enviada correctamente al worker 'alerter-worker'.");
            }
        } catch (fetchError) {
            console.error("❌ Error al intentar contactar al worker de alertas:", fetchError);
        }
    }
};