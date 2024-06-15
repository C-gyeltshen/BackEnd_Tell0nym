import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
const port = 3001
console.log(`Server is running on port ${port}`)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/example-json', (c) => {
  
  const jsonmsg = { message: 'Hello Hono!' }

  return c.json(jsonmsg)
})


serve({
  fetch: app.fetch,
  port
})
