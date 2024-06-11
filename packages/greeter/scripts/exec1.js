const { providers, Wallet } = require('ethers')
const hre = require('hardhat')
const ethers = require('ethers')
const { arbLog, requireEnvVariables } = require('arb-shared-dependencies')
const { EthBridger, getL2Network, addCustomNetwork } = require('@arbitrum/sdk')
requireEnvVariables(['DEVNET_PRIVKEY', 'L2RPC', 'L1RPC'])

/**
 * Set up: instantiate L1 / L2 wallets connected to providers
 */
const walletPrivateKey = process.env.DEVNET_PRIVKEY

const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC)
const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC)

const l1Wallet = new Wallet(walletPrivateKey, l1Provider)
const l2Wallet = new Wallet(walletPrivateKey, l2Provider)

async function l2tol1() {
  await arbLog('Cross-chain Greeter')
  /**
   * Add a custom network to the Arbitrum SDK
   * This is necessary to use the EthBridger, which requires information about the L1 and L2 networks
   */
  addCustomNetwork({
    customL1Network: {
      blockTime: 10,
      chainID: 84532,
      explorerUrl: '',
      isCustom: true,
      name: 'unknown',
      partnerChainIDs: [48220505331],
      isArbitrum: false,
    },
    customL2Network: {
      chainID: 48220505331,
      confirmPeriodBlocks: 150,
      ethBridge: {
        bridge: '0xD1f5071dEe8CcB24CB06E569B91CB28D0ddC69f5',
        inbox: '0x36a1C54eF8b855AA9c615Fe79084Ba0187f3e23F',
        outbox: '0xb206292766f63200f9c6151C2667048eDA397c9a',
        rollup: '0x555fb408604e7FbCfAfb3A87F47771228A5e50F1',
        sequencerInbox: '0x0264a71E02799EDb1d6f6cBdFBcfbFffDc1b743b',
      },
      explorerUrl: '',
      isArbitrum: true,
      isCustom: true,
      name: 'OrbitChain',
      partnerChainID: 84532,
      retryableLifetimeSeconds: 604800,
      nitroGenesisBlock: 0,
      nitroGenesisL1Block: 0,
      depositTimeout: 900000,
      tokenBridge: {
        l1CustomGateway: '0xdE91119040f02D5E27DF18dDdB015C93671EB85A',
        l1ERC20Gateway: '0x9ae964c8F81D8F39Cc850F290846f3705dD52447',
        l1GatewayRouter: '0xdF9Da5A933Ad3864E908060cfd8D2358B7814796',
        l1MultiCall: '0x53766D2CEF3544337ad775cF96Eb2Df834768eFe',
        l1ProxyAdmin: '0x981cE388B0B53C022F5AD6473791A4de585092f4',
        l1Weth: '0x4200000000000000000000000000000000000006',
        l1WethGateway: '0x5C6fE495788468892B5884a2aFB937BBffCF00ec',
        l2CustomGateway: '0x243B4cB3f7C2C2196e96ef53213022ADDaa71079',
        l2ERC20Gateway: '0x0665732aF879004E8D049F786b0C52Aba4e30EcC',
        l2GatewayRouter: '0x7baeeb76af9079DC23FC7f7C6D3BD9E2b9C75C80',
        l2Multicall: '0x3729DCB701162ea50eE4783f24A5130A9b813277',
        l2ProxyAdmin: '0x6D9201a5355690806ea181512D8966465666F7e0',
        l2Weth: '0x6D4D897fE42cFb72Db5f2D43BC94A8aBa303c905',
        l2WethGateway: '0x443977b79f1ad2aEA742e7D03124197bAcd40110',
      },
    },
  })

  /**
   * Use l2Network to create an Arbitrum SDK EthBridger instance
   * We'll use EthBridger to retrieve the Inbox address
   */

  const l2Network = await getL2Network(l2Provider)
  const ethBridger = new EthBridger(l2Network)
  const inboxAddress = ethBridger.l2Network.ethBridge.inbox

  /**
   * We deploy L1 Greeter to L1, L2 greeter to L2, each with a different "greeting" message.
   * After deploying, save set each contract's counterparty's address to its state so that they can later talk to each other.
   */
  const L1Greeter = await (
    await hre.ethers.getContractFactory('GreeterL1')
  ).connect(l1Wallet) //
  console.log('Deploying L1 Greeter 👋')
  const l1Greeter = await L1Greeter.deploy(
    'Hello world in L1',
    ethers.constants.AddressZero, // temp l2 addr
    inboxAddress
  )
  await l1Greeter.deployed()
  console.log(`deployed to ${l1Greeter.address}`)
  const L2Greeter = await (
    await hre.ethers.getContractFactory('GreeterL2')
  ).connect(l2Wallet)

  console.log('Deploying L2 Greeter 👋👋')

  const l2Greeter = await L2Greeter.deploy(
    'Hello world in L2',
    ethers.constants.AddressZero // temp l1 addr
  )
  await l2Greeter.deployed()
  console.log(`deployed to ${l2Greeter.address}`)

  const updateL1Tx = await l1Greeter.updateL2Target(l2Greeter.address)
  await updateL1Tx.wait()

  const updateL2Tx = await l2Greeter.updateL1Target(l1Greeter.address)
  await updateL2Tx.wait()
  console.log('Counterpart contract addresses set in both greeters 👍')

  // Now we can call the L2 contract to send a message back to L1
  console.log('Sending a message from L2 to L1:')
  const newGreetingL1 = 'Hello from the other side'
  const callData = l2Greeter.interface.encodeFunctionData('setGreetingInL1', [
    newGreetingL1,
  ])
  console.log('Call data for L2 execution:', callData)

  await new Promise(resolve => setTimeout(resolve, 5000))

  const setGreetingL1Tx = await l2Greeter.setGreetingInL1(newGreetingL1)
  const setGreetingL1Rec = await setGreetingL1Tx.wait()
  console.log(
    `Greeting txn confirmed on L2! 🙌 ${setGreetingL1Rec.transactionHash}`
  )
}

l2tol1()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
