import { randomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'
import { handleMcpRequest, type McpTool } from '../../src/lib/agent/mcpCore'

const MAX_BODY = 2 * 1024 * 1024

export interface McpHttpServer {
  url: string
  close: () => Promise<void>
}

/**
 * MCP over streamable HTTP (JSON responses) on 127.0.0.1, for one agent run. The URL holds
 * a random secret, so only the process that was given it can reach the tools.
 */
export function startMcpHttpServer(tools: McpTool[], instructions: string): Promise<McpHttpServer> {
  const secret = randomBytes(24).toString('hex')
  const sessionId = randomUUID()
  const endpoint = `/mcp/${secret}`

  const server = http.createServer((request, response) => {
    if (request.url !== endpoint) {
      response.writeHead(404).end()
      return
    }
    // Only answer local callers that do not come from a web page.
    if (request.headers.origin) {
      response.writeHead(403).end()
      return
    }
    if (request.method === 'DELETE') {
      response.writeHead(200).end()
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST, DELETE' }).end()
      return
    }
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        response.writeHead(413).end()
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (response.writableEnded) return
      handleMcpRequest(Buffer.concat(chunks).toString('utf8'), tools, 'screenmovie', instructions)
        .then((answer) => {
          if (answer === null) {
            response.writeHead(202, { 'Mcp-Session-Id': sessionId }).end()
            return
          }
          response.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': sessionId }).end(JSON.stringify(answer))
        })
        .catch(() => {
          if (!response.writableEnded) response.writeHead(500).end()
        })
    })
  })
  // Long tool calls (a first transcription) must not be cut off by the default timeouts.
  server.requestTimeout = 0
  server.headersTimeout = 60_000

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('MCP server did not get a port'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${address.port}${endpoint}`,
        close: () => new Promise((done) => {
          server.closeAllConnections()
          server.close(() => done())
        }),
      })
    })
  })
}
