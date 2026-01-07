const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer, admin] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("Mock Token", "MTK");
  await token.waitForDeployment();
  console.log("Token:", await token.getAddress());

  // Mint some tokens to a user for testing
  await token.mint(deployer.address, ethers.parseEther("1000000"));

  const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
  const feeBps = 500; // 5%
  const proxy = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, feeBps], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();
  console.log("TokenVault (UUPS Proxy):", await proxy.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
