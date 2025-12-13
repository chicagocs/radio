// orchestrator-worker.js

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 1. Obtén el token secreto desde las variables de entorno de Cloudflare
  const githubApiToken = GITHUB_API_TOKEN; 

  // 2. Define los detalles de tu repositorio y workflow
  const owner = 'chicagocs';
  const repo = 'radiomax';
  const workflowId = 'backup.yml'; 

  // 3. Construye la URL de la API de GitHub para lanzar el workflow
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  // 4. Define el cuerpo de la petición.
  // 'ref' es la rama donde se encuentra el workflow (ej: 'main', 'master').
  // 'inputs' son los parámetros que definiste en tu workflow.yml
  const body = {
    ref: 'main',
    inputs: {
      reason: 'Scheduled backup from Cloudflare Worker'
    }
  };

  // 5. Realiza la llamada a la API de GitHub
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${githubApiToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  // 6. Maneja la respuesta
  if (response.ok) {
    console.log('Workflow dispatched successfully!');
    return new Response('GitHub Actions workflow triggered successfully.', { status: 200 });
  } else {
    const errorBody = await response.text();
    console.error(`Failed to dispatch workflow: ${response.status} ${errorBody}`);
    return new Response(`Failed to trigger workflow: ${response.status} ${errorBody}`, { status: 500 });
  }
}
