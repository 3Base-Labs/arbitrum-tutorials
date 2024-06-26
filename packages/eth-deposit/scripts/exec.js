const { utils, providers, Wallet } = require('ethers')
const {
  EthBridger,
  getL2Network,
  EthDepositStatus,
  addCustomNetwork,
} = require('@arbitrum/sdk')
const { parseEther } = utils
const { arbLog, requireEnvVariables } = require('arb-shared-dependencies')
require('dotenv').config()
requireEnvVariables(['DEVNET_PRIVKEY', 'L1RPC', 'L2RPC'])

/**
 * Set up: instantiate L1 / L2 wallets connected to providers
 */
const walletPrivateKey = process.env.DEVNET_PRIVKEY

const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC)
const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC)

const l1Wallet = new Wallet(walletPrivateKey, l1Provider)
const l2Wallet = new Wallet(walletPrivateKey, l2Provider)

/**
 * Set the amount to be deposited in L2 (in wei)
 */
const ethToL2DepositAmount = parseEther('0.1')

const main = async () => {
  await arbLog('Deposit Eth via Arbitrum SDK')

  /**
   * Add the default local network configuration to the SDK
   * to allow this script to run on a local node
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
   * We'll use EthBridger for its convenience methods around transferring ETH to L2
   */

  const l2Network = await getL2Network(l2Provider)
  const ethBridger = new EthBridger(l2Network)

  /**
   * First, let's check the l2Wallet initial ETH balance
   */
  const l2WalletInitialEthBalance = await l2Wallet.getBalance()

  /**
   * transfer ether from L1 to L2
   * This convenience method automatically queries for the retryable's max submission cost and forwards the appropriate amount to L2
   * Arguments required are:
   * (1) amount: The amount of ETH to be transferred to L2
   * (2) l1Signer: The L1 address transferring ETH to L2
   * (3) l2Provider: An l2 provider
   */
  const depositTx = await ethBridger.deposit({
    amount: ethToL2DepositAmount,
    l1Signer: l1Wallet,
    l2Provider: l2Provider,
  })

  const depositRec = await depositTx.wait()
  console.warn('deposit L1 receipt is:', depositRec.transactionHash)

  /**
   * With the transaction confirmed on L1, we now wait for the L2 side (i.e., balance credited to L2) to be confirmed as well.
   * Here we're waiting for the Sequencer to include the L2 message in its off-chain queue. The Sequencer should include it in under 10 minutes.
   */
  console.warn('Now we wait for L2 side of the transaction to be executed ⏳')
  const l2Result = await depositRec.waitForL2(l2Provider)
  /**
   * The `complete` boolean tells us if the l1 to l2 message was successful
   */
  l2Result.complete
    ? console.log(
        `L2 message successful: status: ${
          EthDepositStatus[await l2Result.message.status()]
        }`
      )
    : console.log(
        `L2 message failed: status ${
          EthDepositStatus[await l2Result.message.status()]
        }`
      )

  /**
   * Our l2Wallet ETH balance should be updated now
   */
  const l2WalletUpdatedEthBalance = await l2Wallet.getBalance()
  console.log(
    `your L2 ETH balance is updated from ${l2WalletInitialEthBalance.toString()} to ${l2WalletUpdatedEthBalance.toString()}`
  )
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
