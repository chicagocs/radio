// workers/orchestrator/index.js

export default {
    async scheduled(event, env, ctx) {
        console.log("🤖 Orquestador INICIADO.");
        console.log("Evento recibido:", JSON.stringify(event, null, 2));
        console.log("Variables de entorno:", Object.keys(env));

        const githubApiToken = env.GITHUB_TOKEN;

        if (!githubApiToken) {
            console.error("❌ ERROR CRÍTICO: GITHUB_TOKEN no está en las variables de entorno.");
            return;
        }

        const owner = 'chicagocs';
        const repo = 'radiomax';
        const workflowId = 'backup';
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        const body = {
            ref: 'main',
            inputs: {
                reason: `Scheduled backup from Cloudflare Worker at ${new Date().toISOString()}`
            }
        };

        console.log("📬 Enviando solicitud a GitHub...");
        console.log("   URL completa:", url);
        console.log("   Cuerpo (body):", JSON.stringify(body, null, 2));
        console.log("   Encabezado Authorization:", `token ${githubApiToken.substring(0, 10)}...`);

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

            console.log("📨 Respuesta de GitHub recibida.");
            console.log("   Status:", response.status);
            console.log("   Status Text:", response.statusText);
            console.log("   Headers:", Object.fromEntries(response.headers.entries()));

            const responseText = await response.text();
            console.log("   Cuerpo de la respuesta:", responseText);

            if (response.ok) {
                console.log("✅ Workflow de GitHub dispatch exitoso.");
            } else {
                console.error(`❌ Fallo al hacer dispatch del workflow. Status: ${response.status}`);
            }
        } catch (error) {
            console.error("🚨 ERROR DE RED O EJECUCIÓN:", error);
        }
    },

    async fetch(request, env, ctx) {
        return new Response("Este worker solo se activa por eventos programados (scheduled).", { status: 200 });
    }
};
