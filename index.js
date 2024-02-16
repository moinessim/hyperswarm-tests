import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import goodbye from 'graceful-goodbye'
import b4a from 'b4a'
import DHT from 'hyperdht'
import { program } from 'commander'
import crypto from 'crypto'

program
  .version('0.0.1')
  .option('-n, --name <name>', 'Name of the core')
  .option('-b, --bootstrap <bootstrap>', 'Bootstrap node')
  .option('-i, --ip', 'My public IPv4 address')
  .option('-p, --port', 'My public port')
  .parse(process.argv)

const options = program.opts()


function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

assert( options.bootstrap || (options.ip && options.port), 'You must provide either a bootstrap node or your public IP and port')

const myCoreName = options.name ? options.name : crypto.randomBytes(32).toString('hex')

const topic = Buffer.alloc(32).fill(`this is a reader-writer example`)

const store = new Corestore(`./readerwriter-storage-${myCoreName}`, {
  primaryKey: topic
})

const dhtOptions = { bootstrap: options.bootstrap ? [options.bootstrap] : [] }

let dht

if (options.ip && options.port) {
  dht = new DHT( { port : options.port, ephemeral: false, firewalled: false, anyPort: false, ...dhtOptions })
  dht._nat.add(options.ip, options.port)
} else {
  dht = new DHT(dhtOptions)
}

const swarm = new Hyperswarm({dht})
goodbye(() => swarm.destroy())

const knownCores = new Set()

function sendMessageToAllPeers (message) {
  const peers = [...swarm.connections]
  for (const peer of peers) peer.write(message)
}

function logMessage ({ name, message }) {
  console.log(`[${name}] ${message}`)
}

const prepareCore = core => {
  core.on('append', () => {
    core.get(core.length - 1).then(data => {
      console.log('core ', core.key.toString('hex'), ' appended: ', data.toString())
    })
  })
  knownCores.add(core.key.toString('hex'))
}


const myCore = store.get({name: myCoreName})

await  myCore.ready()

prepareCore(myCore)

const coreKeyPrefix = 'core:'

swarm.on('connection', peer => {
  const name = b4a.toString(peer.remotePublicKey, 'hex').substr(0, 6)
  console.log(`[info] New peer joined, ${name}`)
  peer.on('data', message => {
    if (message.slice(0,5).toString().startsWith(coreKeyPrefix)) {
      const coreKey = message.slice(5).toString()
      if (knownCores.has(coreKey)) return
      const core = store.get(coreKey)
      console.log(`[info] Peer ${name} has core ${coreKey}`)
      core.ready().then(() => prepareCore(core))
    }
  })
  store.replicate(peer)
  for (const coreKey of knownCores) {
    peer.write(coreKeyPrefix + coreKey)
  }
})


swarm.join(topic)


process.stdin.on('data', data => {
    console.log(`appending to core ${myCore.key.toString('hex')}: ${data}`)
    myCore.append(data)
})
