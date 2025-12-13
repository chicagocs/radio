// orchestrator-worker.js
// Actualizar manualmente en Cloudflare Workers este mismo código
// Cloudflare Worker (disparado por un Cron Trigger) -> Llama a la API de GitHub.
// GitHub Actions (recibe la llamada) -> Ejecuta el script de backup.
// GitLab (recibe el push) -> Se actualiza con una copia exacta de repositorio RadioMax de GitHub.
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const githubApiToken = GITHUB_TOKEN; 
  const owner = 'chicagocs';
  const repo = 'radiomax';
  const workflowId = 'backup.yml'; 
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const body = {
    ref: 'main', // Asegúrate que esta es la rama correcta
    inputs: {
      reason: 'Scheduled backup from Cloudflare Worker'
    }
  };

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
    console.log('Workflow dispatched successfully!');
    return new Response('GitHub Actions workflow triggered successfully.', { status: 200 });
  } else {
    const errorBody = await response.text();
    console.error(`Failed to dispatch workflow: ${response.status} ${errorBody}`);
    return new Response(`Failed to trigger workflow: ${response.status} ${errorBody}`, { status: 500 });
  }
}
