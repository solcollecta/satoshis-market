import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider(
  'https://regtest.opnet.org',
  networks.testnet
);

const p2opAddress = 'opt1sqp80vzxan8am4ty40f6r54f5tmrgr2yetsdnlq9c';

async function run() {
  const info = await provider.getPublicKeyInfo(p2opAddress, true);
  const p2trAddress = info.p2tr(networks.testnet);
  console.log('P2TR address:', p2trAddress);
}

run();