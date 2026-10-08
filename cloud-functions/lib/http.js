// EdgeOne Node Functions 的小工具：把 Request 转成好用的形式
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

export function queryParams(request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
