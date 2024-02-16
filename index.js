import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import goodbye from 'graceful-goodbye'
import b4a from 'b4a'

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

const myCoreName = process.argv[2]
assert(myCoreName, 'Please provide a core name')

const topic = Buffer.alloc(32).fill(`this is a reader-writer example`)

const store = new Corestore(`./readerwriter-storage-${myCoreName}`, {
  primaryKey: topic
})

const swarm = new Hyperswarm()
goodbye(() => swarm.destroy())

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
      const core = store.get(coreKey)
      console.log(`[info] Peer ${name} has core ${coreKey}`)
      core.ready().then(() => prepareCore(core))
    }
  })
  store.replicate(peer)
  peer.write('core:' + myCore.key.toString('hex'))
})


swarm.join(topic)


process.stdin.on('data', data => {
    console.log(`appending to core ${myCore.key.toString('hex')}: ${data}`)
    myCore.append(data)
})
