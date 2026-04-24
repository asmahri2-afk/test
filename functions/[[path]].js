export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 1. If it's NOT an API call, let the website load normally
  if (!url.pathname.startsWith('/api')) {
    return context.next(); 
  }

  // 2. It IS an API call. Strip "/api" so the Worker understands the path
  // Example: /api/weather becomes /weather
  let workerPath = url.pathname.replace(/^\/api/, '');
  if (workerPath === '') workerPath = '/';

  // 3. Forward the request to your Worker via the Service Binding
  const newRequest = new Request('https://internal' + workerPath + url.search, context.request);

  try {
    return await context.env.VESSEL_API.fetch(newRequest);
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: "Bridge Connection Failed", 
      details: e.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
