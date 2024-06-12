const { addCustomNetwork, L1ToL2MessageGasEstimator } = require('@arbitrum/sdk')
const { getBaseFee } = require('@arbitrum/sdk/dist/lib/utils/lib')
const { ethers, BigNumber } = require('ethers')
const ArbOwnerAbi = require('./abis/ArbOwner.json')
const InboxAbi = require('./abis/Inbox.json')
const UpgradeExecutorAbi = require('./abis/UpgradeExecutor.json')

const ArbOwnerAddress = '0x0000000000000000000000000000000000000070'
const InboxAddress = '0x36a1C54eF8b855AA9c615Fe79084Ba0187f3e23F'
const UpgradeExecutorAddress = '0x8B6CA51FE6dB4b24784EBADA193e690ade2EE6d3'
const l1Provider = new ethers.providers.JsonRpcProvider(
  'https://sepolia.base.org'
)
const l2Provider = new ethers.providers.JsonRpcProvider(
  'https://rpc.l3.3base.org'
)

const L2GasFee = ethers.utils.parseUnits('1', 'gwei')
const timeLockContractAddress = '0x611d503790cC9845665957Cf5120513bC0Cc30E6'

const main = async () => {
  const ArbOwner = new ethers.Contract(ArbOwnerAddress, ArbOwnerAbi)
  const Inbox = new ethers.Contract(InboxAddress, InboxAbi)
  const UpgradeExecutor = new ethers.Contract(
    UpgradeExecutorAddress,
    UpgradeExecutorAbi
  )

  const gasFeeCallData = await ArbOwner.interface.encodeFunctionData(
    'setMinimumL2BaseFee',
    [L2GasFee]
  )
  const upgradeExecutorCallData =
    await UpgradeExecutor.interface.encodeFunctionData('executeCall', [
      ArbOwnerAddress,
      gasFeeCallData,
    ])

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
  const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider)

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

  const baseFee = await getBaseFee(l1Provider)

  const L1ToL2MessageGasParams = await l1ToL2MessageGasEstimate.estimateAll(
    {
      from: timeLockContractAddress,
      to: UpgradeExecutorAddress,
      l2CallValue: 0,
      excessFeeRefundAddress: '0xC4c3d44eB95C24BABc172Ff4A7006ED1565e9D9E',
      callValueRefundAddress: '0xC4c3d44eB95C24BABc172Ff4A7006ED1565e9D9E',
      data: upgradeExecutorCallData,
    },
    baseFee,
    l1Provider,
    RetryablesGasOverrides //if provided, it will override the estimated values. Note that providing "RetryablesGasOverrides" is totally optional.
  )
  const gasPriceBid = await l2Provider.getGasPrice()
  const args = [
    UpgradeExecutorAddress,
    0,
    L1ToL2MessageGasParams.maxSubmissionCost.toString(),
    '0xC4c3d44eB95C24BABc172Ff4A7006ED1565e9D9E',
    '0xC4c3d44eB95C24BABc172Ff4A7006ED1565e9D9E',
    L1ToL2MessageGasParams.gasLimit.toString(),
    gasPriceBid.toString(),
    upgradeExecutorCallData,
  ]
  const createRetryableCalldata = await Inbox.interface.encodeFunctionData(
    'createRetryableTicket',
    args
  )
  console.log({
    target: InboxAddress,
    args,
    value: L1ToL2MessageGasParams.deposit.toString(),
  })
  const data = JSON.stringify(
    {
      proposalId: '',
      proposal: `Proposal #${Date.now()}: Update L2 gas fee to ${L2GasFee}`,
      targets: [InboxAddress],
      values: [Number(L1ToL2MessageGasParams.deposit.toString())],
      calldata: [createRetryableCalldata],
    },
    null,
    2
  )
  console.log(data)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
