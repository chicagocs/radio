// workers/orchestrator/index.js

/**
 * Se dispara cuando el Worker se ejecuta por una tarea programada (Cron Trigger).
 * @param {ScheduledEvent} event - El evento programado.
 * @param {Env} env - El objeto de entorno con las variables secretas.
 */
export default {
    async scheduled(event, env, ctx) {
        console.log("Iniciando backup programado...");

        // 1. Obtenemos el token de GitHub de forma segura desde las variables de entorno.
        const githubApiToken = env.GITHUB_TOKEN;

        if (!githubApiToken) {
            console.error("Error: GITHUB_TOKEN no está configurado en las variables de entorno del Worker.");
            // No podemos hacer nada más, así que terminamos aquí.
            return;
        }

        // 2. Parámetros para la API de GitHub
        const owner = 'chicagocs'; // Tu usuario de GitHub
        const repo = 'radiomax';     // Tu repositorio
        const workflowId = 'backup'; // backup.yml
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        const body = {
            ref: 'main', // La rama donde se ejecutará el workflow
            inputs: {
                reason: `Scheduled backup from Cloudflare Worker at ${new Date().toISOString()}`
            }
        };

        // 3. Hacemos la llamada a la API de GitHub
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubApiToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Cloudflare-Worker-Orchestrator'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                console.log('Workflow de GitHub dispatch exitosamente.');
            } else {
                const errorBody = await response.text();
                console.error(`Fallo al hacer dispatch del workflow: ${response.status} ${errorBody}`);
            }
        } catch (error) {
            console.error("Error al intentar conectar con la API de GitHub:", error);
        }
    },

    // Opcional: puedes dejar un fetch handler por si quieres una forma manual de trigger
    async fetch(request, env, ctx) {
        return new Response("Este worker solo se activa por eventos programados (scheduled).", { status: 200 });
    }
};
