import Fastify from 'fastify'

const app = Fastify({
  logger: true
})

app.get('/', async (req, res) => {
  return { hello_world: 'world from fastify!!' }
})

app.listen(process.env.SERVER_PORT || 3000, '0.0.0.0', (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
