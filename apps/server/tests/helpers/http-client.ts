import { request } from "node:http";

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export async function requestJson(url: string, options: RequestOptions = {}) {
  return new Promise<{
    status: number;
    json: <T = any>() => Promise<T>;
  }>((resolve, reject) => {
    const req = request(
      new URL(url),
      {
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("error", reject);
        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            json: async <T>() => JSON.parse(payload) as T,
          });
        });
      },
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
