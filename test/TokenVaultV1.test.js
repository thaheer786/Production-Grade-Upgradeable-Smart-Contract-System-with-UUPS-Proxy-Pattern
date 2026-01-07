const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Import chai matchers manually
require("@nomicfoundation/hardhat-chai-matchers");

describe("TokenVaultV1", function () {
  let token, vault, admin, user;

  beforeEach(async function () {
    [admin, user] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Mock Token", "MTK");
    await token.waitForDeployment();

    // mint to user
    await token.mint(user.address, ethers.parseEther("10000"));

    const TokenVaultV1 = await ethers.getContractFactory("TokenVaultV1");
    vault = await upgrades.deployProxy(TokenVaultV1, [await token.getAddress(), admin.address, 500], { kind: "uups", initializer: "initialize" });
    await vault.waitForDeployment();
  });

  it("should initialize with correct parameters", async function () {
    expect(await vault.getDepositFee()).to.equal(500n);
    expect(await vault.getImplementationVersion()).to.equal("V1");
    const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
    const PAUSER_ROLE = await vault.PAUSER_ROLE();
    const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
    expect(await vault.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await vault.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
    expect(await vault.hasRole(PAUSER_ROLE, admin.address)).to.equal(true);
  });

  it("should allow deposits and update balances", async function () {
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("950"));
  });

  it("should deduct deposit fee correctly", async function () {
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
  });

  it("should allow withdrawals and update balances", async function () {
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    await vault.connect(user).withdraw(ethers.parseEther("300"));
    expect(await vault.balanceOf(user.address)).to.equal(ethers.parseEther("650"));
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("650"));
    // user receives 300 back from vault; fee stays with vault
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("9300"));
  });

  it("should prevent withdrawal of more than balance", async function () {
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(ethers.parseEther("1000"));
    await expect(vault.connect(user).withdraw(ethers.parseEther("1001"))).to.be.revertedWith("Insufficient balance");
  });

  it("should prevent reinitialization", async function () {
    await expect(vault.initialize(await token.getAddress(), admin.address, 100)).to.be.reverted;
  });
});
