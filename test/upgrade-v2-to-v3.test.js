const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Upgrade V2 to V3", function () {
  let token, vault, admin, user;

  beforeEach(async function () {
    [admin, user] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Mock Token", "MTK");
    await token.waitForDeployment();
    await token.mint(user.address, ethers.parseEther("10000"));

    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    vault = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, 500], { kind: "uups", initializer: "initialize" });
    await vault.waitForDeployment();

    // Upgrade to V2 and configure
    const TokenVaultV2 = await ethers.getContractFactory("TokenVaultV2");
    vault = await upgrades.upgradeProxy(await vault.getAddress(), TokenVaultV2);
    await vault.waitForDeployment();
    await vault.connect(admin).setYieldRate(500);

    // user deposits in V2
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));

    // Upgrade to V3
    const TokenVaultV3 = await ethers.getContractFactory("TokenVaultV3");
    vault = await upgrades.upgradeProxy(await vault.getAddress(), TokenVaultV3);
    await vault.waitForDeployment();
  });

  it("should preserve all V2 state after upgrade", async function () {
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("950"));
    expect(await vault.getYieldRate()).to.equal(500n);
  });

  it("should allow setting withdrawal delay", async function () {
    await vault.connect(admin).setWithdrawalDelay(3600);
    expect(await vault.getWithdrawalDelay()).to.equal(3600n);
  });

  it("should handle withdrawal requests correctly", async function () {
    await vault.connect(admin).setWithdrawalDelay(3600);
    await vault.connect(user).requestWithdrawal(ethers.parseEther("100"));
    const [amount, requestTime] = await vault.getWithdrawalRequest(user.address);
    expect(amount).to.equal(ethers.parseEther("100"));
    expect(requestTime).to.be.gt(0n);
  });

  it("should enforce withdrawal delay", async function () {
    await vault.connect(admin).setWithdrawalDelay(3600);
    await vault.connect(user).requestWithdrawal(ethers.parseEther("100"));
    await expect(vault.connect(user).executeWithdrawal()).to.be.revertedWith("Delay not passed");
    // increase time
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");
    // Fund vault with tokens to cover withdrawal
    await token.mint(await vault.getAddress(), ethers.parseEther("100"));
    const tx = await vault.connect(user).executeWithdrawal();
    await tx.wait();
    expect(await token.balanceOf(user.address)).to.be.gt(0n);
  });

  it("should allow emergency withdrawals", async function () {
    // Fund vault with enough tokens
    await token.mint(await vault.getAddress(), ethers.parseEther("1000"));
    const balBefore = await vault.balanceOf(user.address);
    const tx = await vault.connect(user).emergencyWithdraw();
    await tx.wait();
    expect(await vault.balanceOf(user.address)).to.equal(0n);
    expect(await token.balanceOf(user.address)).to.be.gte(ethers.parseEther("10000") - ethers.parseEther("50"));
    expect(await vault.totalDeposits()).to.equal(0n);
  });

  it("should prevent premature withdrawal execution", async function () {
    await vault.connect(admin).setWithdrawalDelay(24 * 60 * 60);
    await vault.connect(user).requestWithdrawal(ethers.parseEther("100"));
    await expect(vault.connect(user).executeWithdrawal()).to.be.revertedWith("Delay not passed");
  });
});
