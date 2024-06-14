# Greeter Tutorial

`greeter` is a simple demo of Arbitrum's L1-to-L2 and L2-to-L1message passing system.

It deploys 2 contracts - one to L1, and another to L2, and has the L1 contract send a message to the L2 contract to be executed automatically. Also, the L2 contract sends a message to the L1 contract to be executed manually.

The script and contracts demonstrate how to interact with Arbitrum's core bridge contracts to create these retryable messages, how to calculate and forward appropriate fees from L1 to L2, and how to use Arbitrum's L1-to-L2 message [address aliasing](https://developer.offchainlabs.com/docs/l1_l2_messages#address-aliasing).

See [./exec.js](./scripts/exec.js) for inline explanation.

## Config Environment Variables

Set the values shown in `.env-sample` as environmental variables. To copy it into a `.env` file:

```bash
cp .env-sample .env
```

(you'll still need to edit some variables, i.e., `DEVNET_PRIVKEY`)

### Run Demo:
1. L1 to L2 message passing
```
yarn deploy
```
wait 3-5 minutes for the L1-to-L2 message to be executed

2. L2 to L1 message passing
```
yarn deploy1
cd ../outbox-execute
yarn outbox-exec --txHash <txHash>
```
`txHash` can be found in the output of the previous command
wait 10-20 minutes for the L2-to-L1 message to be executed

More details about Message Passing in the [Arbitrum Developer Docs](https://developer.offchainlabs.com/docs/l1_l2_messages)
