const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS env var required");

  const TokenVaultV3 = await ethers.getContractFactory("TokenVaultV3");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TokenVaultV3, { kind: "uups" });
  await upgraded.waitForDeployment();
  console.log("Upgraded to V3 at:", await upgraded.getAddress());

  // Example: Set withdrawal delay to 1 day
  const [deployer] = await ethers.getSigners();
  await upgraded.connect(deployer).setWithdrawalDelay(24 * 60 * 60);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
