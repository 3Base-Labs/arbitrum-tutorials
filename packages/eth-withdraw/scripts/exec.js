const { utils, providers, Wallet } = require('ethers')
const { EthBridger, getL2Network, addCustomNetwork } = require('@arbitrum/sdk')
const { parseEther } = utils
const { arbLog, requireEnvVariables } = require('arb-shared-dependencies')
require('dotenv').config()
requireEnvVariables(['DEVNET_PRIVKEY', 'L2RPC', 'L1RPC'])

/**
 * Set up: instantiate L2 wallet connected to provider
 */
const walletPrivateKey = process.env.DEVNET_PRIVKEY
const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC)
const l2Wallet = new Wallet(walletPrivateKey, l2Provider)

/**
 * Set the amount to be withdrawn from L2 (in wei)
 */
const ethFromL2WithdrawAmount = parseEther('0.01')

const main = async () => {
  await arbLog('Withdraw Eth via Arbitrum SDK')

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
   * We'll use EthBridger for its convenience methods around transferring ETH from L2 to L1
   */

  const l2Network = await getL2Network(l2Provider)
  const ethBridger = new EthBridger(l2Network)

  /**
   * First, let's check our L2 wallet's initial ETH balance and ensure there's some ETH to withdraw
   */
  const l2WalletInitialEthBalance = await l2Wallet.getBalance()

  if (l2WalletInitialEthBalance.lt(ethFromL2WithdrawAmount)) {
    console.log(
      `Oops - not enough ether; fund your account L2 wallet currently ${l2Wallet.address} with at least 0.000001 ether`
    )
    process.exit(1)
  }
  console.log('Wallet properly funded: initiating withdrawal now')

  /**
   * We're ready to withdraw ETH using the ethBridger instance from Arbitrum SDK
   * It will use our current wallet's address as the default destination
   */

  const withdrawTx = await ethBridger.withdraw({
    amount: ethFromL2WithdrawAmount,
    l2Signer: l2Wallet,
    destinationAddress: l2Wallet.address,
  })
  const withdrawRec = await withdrawTx.wait()

  /**
   * And with that, our withdrawal is initiated! No additional time-sensitive actions are required.
   * Any time after the transaction's assertion is confirmed, funds can be transferred out of the bridge via the outbox contract
   * We'll display the withdrawals event data here:
   */
  console.log(`Ether withdrawal initiated! 🥳 ${withdrawRec.transactionHash}`)

  const withdrawEventsData = await withdrawRec.getL2ToL1Events()
  console.log('Withdrawal data:', withdrawEventsData)
  console.log(
    `To claim funds (after dispute period), see outbox-execute repo 🫡`
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
