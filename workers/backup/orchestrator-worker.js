// orchestrator-worker.js

export default {
  /**
   * Este manejador se ejecuta cuando el Worker recibe una solicitud HTTP
   * (por ejemplo, si alguien visita su URL en un navegador).
   * Su propósito es evitar el error "No fetch handler!".
   */
  async fetch(request, env, ctx) {
    console.log("Petición fetch recibida. Este Worker se ejecuta principalmente en un horario programado.");
    return new Response("El orquestador de backup está activo. Para ver los logs de la tarea programada, revisa el dashboard de Cloudflare Workers.", {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },

  /**
   * Este es tu manejador original. Se ejecutará según el Cron Trigger
   * que configures en el dashboard de Cloudflare.
   */
  async scheduled(event, env, ctx) {
    console.log("Iniciando orquestación de backup programado...");

    const WORKFLOW_ID = 'backup.yml'; 
    
    // CAMBIO AQUÍ: Usamos la variable de entorno ORIGIN_TOKEN
    const GITHUB_TOKEN = env.ORIGIN_TOKEN;
    
    const OWNER = env.REPO_OWNER;
    const REPO = env.REPO_NAME;

    if (!GITHUB_TOKEN || !OWNER || !REPO) {
        console.error("Faltan variables de entorno críticas.");
        return;
    }

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main', // Asegúrate de que 'main' es la rama correcta
                inputs: {
                    reason: 'Scheduled backup via Cloudflare Worker'
                }
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Error de GitHub API: ${response.status} ${errorBody}`);
        }

        console.log("Workflow de backup disparado exitosamente.");
    } catch (error) {
        console.error("Fallo al disparar el workflow de backup:", error);
    }
  }
};
