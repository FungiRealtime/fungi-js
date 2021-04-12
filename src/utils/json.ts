import { fetchWithTimeout } from "./fetchWithTimeout";

export async function json<TReceivedJSON>(
  data: any,
  input: RequestInfo,
  headers: HeadersInit = {}
) {
  const response = await fetchWithTimeout(input, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Received ${response.status} from input: ${input}`);
  }

  const receivedJson = (await response.json()) as TReceivedJSON;
  return receivedJson;
}
