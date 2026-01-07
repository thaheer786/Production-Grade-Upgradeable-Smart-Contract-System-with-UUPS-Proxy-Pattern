const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

describe("Security", function () {
  it("should prevent direct initialization of implementation contracts", async function () {
    const [admin] = await ethers.getSigners();
    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    const impl = await TokenVaultV1.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize(ethers.ZeroAddress, admin.address, 100)).to.be.reverted;
  });

  it("should prevent unauthorized upgrades", async function () {
    const [admin, attacker] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock Token", "MTK");
    await token.waitForDeployment();

    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    const proxy = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, 100], { kind: "uups", initializer: "initialize" });
    await proxy.waitForDeployment();

    const TokenVaultV2 = await ethers.getContractFactory("TokenVaultV2");
    const implV2 = await TokenVaultV2.deploy();
    await implV2.waitForDeployment();

    // attacker tries to call upgradeToAndCall on proxy
    await expect(proxy.connect(attacker).upgradeToAndCall(await implV2.getAddress(), "0x")).to.be.reverted;
  });

  it("should use storage gaps for future upgrades", async function () {
    const root = path.resolve(__dirname, "..");
    const v1 = fs.readFileSync(path.join(root, "contracts", "TokenVaultV1.sol"), "utf8");
    const v2 = fs.readFileSync(path.join(root, "contracts", "TokenVaultV2.sol"), "utf8");
    const v3 = fs.readFileSync(path.join(root, "contracts", "TokenVaultV3.sol"), "utf8");
    expect(v1.includes("__gap")).to.equal(true);
    expect(v2.includes("__gap")).to.equal(true);
    expect(v3.includes("__gap")).to.equal(true);
  });

  it("should not have storage layout collisions across versions", async function () {
    const [admin, user] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock Token", "MTK");
    await token.waitForDeployment();
    await token.mint(user.address, ethers.parseEther("10000"));

    // Deploy V1 and perform operations
    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    let proxy = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, 500], { kind: "uups", initializer: "initialize" });
    await proxy.waitForDeployment();
    await token.connect(user).approve(await proxy.getAddress(), ethers.parseEther("1000"));
    await proxy.connect(user).deposit(ethers.parseEther("1000"));

    // Upgrade to V2 and verify state
    const TokenVaultV2 = await ethers.getContractFactory("TokenVaultV2");
    proxy = await upgrades.upgradeProxy(await proxy.getAddress(), TokenVaultV2);
    await proxy.waitForDeployment();
    expect(await proxy.balanceOf(user.address)).to.equal(ethers.parseEther("950"));

    // Upgrade to V3 and verify state
    const TokenVaultV3 = await ethers.getContractFactory("TokenVaultV3");
    proxy = await upgrades.upgradeProxy(await proxy.getAddress(), TokenVaultV3);
    await proxy.waitForDeployment();
    expect(await proxy.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
    expect(await proxy.totalDeposits()).to.equal(ethers.parseEther("950"));
  });

  it("should prevent function selector clashing", async function () {
    // Basic sanity: ensure distinct selectors for required functions
    const selectors = new Set();
    const sigs = [
      "initialize(address,address,uint256)",
      "deposit(uint256)",
      "withdraw(uint256)",
      "balanceOf(address)",
      "totalDeposits()",
      "getDepositFee()",
      "getImplementationVersion()",
      "setYieldRate(uint256)",
      "getYieldRate()",
      "claimYield()",
      "getUserYield(address)",
      "pauseDeposits()",
      "unpauseDeposits()",
      "isDepositsPaused()",
      "emergencyWithdraw()",
      "setWithdrawalDelay(uint256)",
      "getWithdrawalDelay()",
      "requestWithdrawal(uint256)",
      "executeWithdrawal()",
      "getWithdrawalRequest(address)"
    ];
    for (const s of sigs) {
      const sel = ethers.id(s).slice(0, 10);
      expect(selectors.has(sel)).to.equal(false);
      selectors.add(sel);
    }
  });
});
