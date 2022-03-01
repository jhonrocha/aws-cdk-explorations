require('dotenv').config()
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify({
  logger: true
})

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const loaders = {
  Dogs: {
    async owner (queries, { reply }) {
      queries.map(({ obj, params }) => {
        return 1
      })
    }
  }
}

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
  }
}

app.register(mercurius, {
  graphiql: true,
  schema,
  resolvers,
  loaders
})

app.get('/', async (req, res) => {
  return { hello_world: 'world from fastify! Test:4!' }
})

app.listen(
  process.env.SERVER_PORT || 80,
  process.env.SERVER_ADDRESS || '0.0.0.0',
  (err) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }
  })
