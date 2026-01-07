const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Upgrade V1 to V2", function () {
  let token, vault, admin, user, other;

  beforeEach(async function () {
    [admin, user, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Mock Token", "MTK");
    await token.waitForDeployment();
    await token.mint(user.address, ethers.parseEther("10000"));

    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    vault = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, 500], { kind: "uups", initializer: "initialize" });
    await vault.waitForDeployment();

    // user deposits in V1
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));

    // upgrade to V2
    const TokenVaultV2 = await ethers.getContractFactory("TokenVaultV2");
    vault = await upgrades.upgradeProxy(await vault.getAddress(), TokenVaultV2);
    await vault.waitForDeployment();
  });

  it("should preserve user balances after upgrade", async function () {
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
  });

  it("should preserve total deposits after upgrade", async function () {
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("950"));
  });

  it("should maintain admin access control after upgrade", async function () {
    const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
    const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
    expect(await vault.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await vault.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
  });

  it("should allow setting yield rate in V2", async function () {
    await vault.connect(admin).setYieldRate(500);
    expect(await vault.getYieldRate()).to.equal(500n);
  });

  it("should calculate yield correctly", async function () {
    await vault.connect(admin).setYieldRate(500); // 5% APY

    // user makes another deposit in V2 to set last claim baseline
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    // Now balance should be 1900 (950 + 950)
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("1900"));

    // advance time by 365 days
    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    // Yield = (balance * yieldRate * timeElapsed) / (365 days * 10000)
    // For 1 year: (1900 * 500 * 365*86400) / (365*86400 * 10000) = 1900 * 500 / 10000 = 95
    const expectedYield = ethers.parseEther("95");
    // mint tokens to vault to cover yield on withdrawal
    await token.mint(await vault.getAddress(), expectedYield);

    const preview = await vault.getUserYield(user.address);
    expect(preview).to.closeTo(expectedYield, ethers.parseEther("1"));

    const claimed = await vault.connect(user).claimYield();
    const rcpt = await claimed.wait();
    // After claim, balance increases by ~expectedYield
    const balanceAfter = await vault.balanceOf(user.address);
    expect(balanceAfter).to.be.closeTo(ethers.parseEther("1900") + expectedYield, ethers.parseEther("1"));
  });

  it("should prevent non-admin from setting yield rate", async function () {
    await expect(vault.connect(other).setYieldRate(100)).to.be.reverted;
  });

  it("should allow pausing deposits in V2", async function () {
    await vault.connect(admin).pauseDeposits();
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await expect(vault.connect(user).deposit(ethers.parseEther("1000"))).to.be.revertedWith("Deposits paused");
    await vault.connect(admin).unpauseDeposits();
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    expect(await vault.balanceOf(user.address)).to.be.gt(0n);
  });
});
