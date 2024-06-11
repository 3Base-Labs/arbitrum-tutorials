const { providers, Wallet } = require('ethers')
const { BigNumber } = require('@ethersproject/bignumber')
const hre = require('hardhat')
const ethers = require('ethers')
const {
  L1ToL2MessageGasEstimator,
} = require('@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator')
const { arbLog, requireEnvVariables } = require('arb-shared-dependencies')
const {
  L1TransactionReceipt,
  L1ToL2MessageStatus,
  EthBridger,
  getL2Network,
  addCustomNetwork,
} = require('@arbitrum/sdk')
const { getBaseFee } = require('@arbitrum/sdk/dist/lib/utils/lib')
requireEnvVariables(['DEVNET_PRIVKEY', 'L2RPC', 'L1RPC'])

/**
 * Set up: instantiate L1 / L2 wallets connected to providers
 */
const walletPrivateKey = process.env.DEVNET_PRIVKEY

const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC)
const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC)

const l1Wallet = new Wallet(walletPrivateKey, l1Provider)
const l2Wallet = new Wallet(walletPrivateKey, l2Provider)

const main = async () => {
  await arbLog('Cross-chain Greeter')

  /**
   * Add the custom network configuration to the SDK
   * to allow this script to run on a custom network
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

  /**
   * Let's log the L2 greeting string
   */
  const currentL2Greeting = await l2Greeter.greet()
  console.log(`Current L2 greeting: "${currentL2Greeting}"`)

  console.log('Updating greeting from L1 to L2:')

  /**
   * Here we have a new greeting message that we want to set as the L2 greeting; we'll be setting it by sending it as a message from layer 1!!!
   */
  const newGreeting = 'Greeting from far, far away'

  /**
   * Now we can query the required gas params using the estimateAll method in Arbitrum SDK
   */
  const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider)

  /**
   * To be able to estimate the gas related params to our L1-L2 message, we need to know how many bytes of calldata out retryable ticket will require
   * i.e., we need to calculate the calldata for the function being called (setGreeting())
   */
  const ABI = ['function setGreeting(string _greeting)']
  const iface = new ethers.utils.Interface(ABI)
  const calldata = iface.encodeFunctionData('setGreeting', [newGreeting])

  /**
   * Users can override the estimated gas params when sending an L1-L2 message
   * Note that this is totally optional
   * Here we include and example for how to provide these overriding values
   */

  const RetryablesGasOverrides = {
    gasLimit: {
      base: undefined, // when undefined, the value will be estimated from rpc
      min: BigNumber.from(10000), // set a minimum gas limit, using 10000 as an example
      percentIncrease: BigNumber.from(30), // how much to increase the base for buffer
    },
    maxSubmissionFee: {
      base: undefined,
      percentIncrease: BigNumber.from(30),
    },
    maxFeePerGas: {
      base: undefined,
      percentIncrease: BigNumber.from(30),
    },
  }

  /**
   * The estimateAll method gives us the following values for sending an L1->L2 message
   * (1) maxSubmissionCost: The maximum cost to be paid for submitting the transaction
   * (2) gasLimit: The L2 gas limit
   * (3) deposit: The total amount to deposit on L1 to cover L2 gas and L2 call value
   */
  const L1ToL2MessageGasParams = await l1ToL2MessageGasEstimate.estimateAll(
    {
      from: await l1Greeter.address,
      to: await l2Greeter.address,
      l2CallValue: 0,
      excessFeeRefundAddress: await l2Wallet.address,
      callValueRefundAddress: await l2Wallet.address,
      data: calldata,
    },
    await getBaseFee(l1Provider),
    l1Provider,
    RetryablesGasOverrides //if provided, it will override the estimated values. Note that providing "RetryablesGasOverrides" is totally optional.
  )
  console.log(
    `Current retryable base submission price is: ${L1ToL2MessageGasParams.maxSubmissionCost.toString()}`
  )

  /**
   * For the L2 gas price, we simply query it from the L2 provider, as we would when using L1
   */
  const gasPriceBid = await l2Provider.getGasPrice()
  console.log(`L2 gas price: ${gasPriceBid.toString()}`)

  console.log(
    `Sending greeting to L2 with ${L1ToL2MessageGasParams.deposit.toString()} callValue for L2 fees:`
  )
  // get call data
  const callDataForL1Execution = l1Greeter.interface.encodeFunctionData(
    'setGreetingInL2',
    [
      newGreeting,
      L1ToL2MessageGasParams.maxSubmissionCost,
      L1ToL2MessageGasParams.gasLimit,
      gasPriceBid,
    ]
  )
  console.log('params', [
    newGreeting,
    L1ToL2MessageGasParams.maxSubmissionCost,
    L1ToL2MessageGasParams.gasLimit,
    gasPriceBid,
  ])
  console.log('Call data for L1 execution:', callDataForL1Execution)
  console.log('value:', L1ToL2MessageGasParams.deposit.toString())

  await new Promise(resolve => setTimeout(resolve, 5000))

  const setGreetingTx = await l1Greeter.setGreetingInL2(
    newGreeting, // string memory _greeting,
    L1ToL2MessageGasParams.maxSubmissionCost,
    L1ToL2MessageGasParams.gasLimit,
    gasPriceBid,
    {
      value: L1ToL2MessageGasParams.deposit,
    }
  )
  const setGreetingRec = await setGreetingTx.wait()

  console.log(
    `Greeting txn confirmed on L1! 🙌 ${setGreetingRec.transactionHash}`
  )

  const l1TxReceipt = new L1TransactionReceipt(setGreetingRec)

  /**
   * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
   * In this case, we know our txn triggered only one
   * Here, We check if our L1 to L2 message is redeemed on L2
   */
  const messages = await l1TxReceipt.getL1ToL2Messages(l2Wallet)
  const message = messages[0]
  console.log(
    'Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰'
  )
  const messageResult = await message.waitForStatus()
  const status = messageResult.status
  if (status === L1ToL2MessageStatus.REDEEMED) {
    console.log(
      `L2 retryable ticket is executed 🥳 ${messageResult.l2TxReceipt.transactionHash}`
    )
  } else {
    console.log(
      `L2 retryable ticket is failed with status ${L1ToL2MessageStatus[status]}`
    )
  }

  /**
   * Note that during L2 execution, a retryable's sender address is transformed to its L2 alias.
   * Thus, when GreeterL2 checks that the message came from the L1, we check that the sender is this L2 Alias.
   * See setGreeting in GreeterL2.sol for this check.
   */

  /**
   * Now when we call greet again, we should see our new string on L2!
   */
  const newGreetingL2 = await l2Greeter.greet()
  console.log(`Updated L2 greeting: "${newGreetingL2}" 🥳`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
