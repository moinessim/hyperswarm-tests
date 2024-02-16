import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import goodbye from 'graceful-goodbye'
import b4a from 'b4a'

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

const instanceNumber = Number(process.argv[2])
const instances = Number(process.argv[3])

assert(Number.isInteger(instanceNumber))
assert(Number.isInteger(instances))
assert(instanceNumber >= 0)
assert(instances > 0)
assert(instanceNumber < instances)

const mkName = instanceNumber => `reader-writer-example-${instanceNumber}`

const mkKey = instanceNumber =>
  ({ 0 : "cc5fb251d792d73246c5cb9a4307dc1e9a7c7ff02832aed7254da6d60967a18c"
    ,1 : "679dbe06ae147ec331cddad0a94d96012b9b414e6849a88b5839dcc59c853948"
    ,2 : "3d7c60315c1bf71571d842e9fc77da4c08f93cf2e8c6a64005c1f84d3f6d5549"
  }[instanceNumber])

const topic = Buffer.alloc(32).fill(`this is a reader-writer example`)

const store = new Corestore(`./readerwriter-storage-${instanceNumber}`, {
  primaryKey: topic
})

const swarm = new Hyperswarm()
goodbye(() => swarm.destroy())


const cores = Array.from({ length: instances }, (_, i) =>
  store.get(
    i === instanceNumber
    ? { name: mkName(i), valueEncoding: 'utf-8' }
    : {  valueEncoding: 'utf-8', key: mkKey(i) }
  )
)

await Promise.all(cores.map(core => core.ready()))

const prepareCore = core => {
  core.on('append', () => {
    core.get(core.length - 1).then(data => {
      console.log('core ', core.key.toString('hex'), ' appended: ', data.toString())
    })
  })
}

let myCore

cores.forEach((core,i) => {
  if (i === instanceNumber) {
    console.log( 'my core' ,i, 'key: ', core.key.toString('hex'));
    myCore = core
  }
  else {
    console.log( 'core ',i, 'key: ', core.key.toString('hex'));
    prepareCore(core)
  }

})

swarm.on('connection', conn => store.replicate(conn))

swarm.join(topic)


process.stdin.on('data', data => {
    console.log(`appending to core ${instanceNumber}`)
    myCore.append(data)
})
