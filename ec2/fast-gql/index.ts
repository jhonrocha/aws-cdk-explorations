import Fastify from 'fastify'

const app = Fastify({
  logger: true
})

app.get('/', async (req, res) => {
  return { hello_world: 'world from fastify!' }
})

app.listen(process.env.SERVER_PORT || 80)
