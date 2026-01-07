// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TokenVaultV1} from "./TokenVaultV1.sol";

/**
 * @title TokenVaultV2
 * @notice Extends V1 with yield accrual and deposit pause controls.
 * @dev Appends storage variables only; preserves inheritance and layout.
 */
contract TokenVaultV2 is TokenVaultV1 {
    // New state (V2)
    uint256 private _yieldRate; // basis points annual
    mapping(address => uint256) private _lastClaimTime; // last claim timestamp per user
    bool private _depositsPaused; // pause control for deposits only

    // Events
    event YieldRateUpdated(uint256 newRateBps);
    event YieldClaimed(address indexed user, uint256 yieldAmount);
    event DepositsPaused(address indexed by);
    event DepositsUnpaused(address indexed by);

    /**
     * @notice Set annual yield rate in basis points.
     * @dev Only DEFAULT_ADMIN_ROLE can set.
     */
    function setYieldRate(uint256 _yieldRateBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_yieldRateBps <= 10000, "Rate too high");
        _yieldRate = _yieldRateBps;
        emit YieldRateUpdated(_yieldRateBps);
    }

    /**
     * @notice Get annual yield rate in basis points.
     */
    function getYieldRate() external view returns (uint256) {
        return _yieldRate;
    }

    /**
     * @notice Preview user accrued yield since last claim.
     * @dev Yield = (balance * yieldRate * timeElapsed) / (365 days * 10000)
     */
    function getUserYield(address user) public view returns (uint256) {
        uint256 last = _lastClaimTime[user];
        if (last == 0) return 0;
        uint256 bal = _balances[user];
        if (bal == 0 || _yieldRate == 0) return 0;
        uint256 elapsed = block.timestamp - last;
        return (bal * _yieldRate * elapsed) / (365 days * 10000);
    }

    /**
     * @notice Claim accrued yield and credit to internal balance.
     * @dev Does not auto-compound unless user claims (i.e., added to balance only on claim).
     *      Requires the vault to have sufficient token liquidity to cover yield on eventual withdrawals.
     * @return amount Claimed yield amount.
     */
    function claimYield() external returns (uint256 amount) {
        amount = getUserYield(msg.sender);
        require(amount > 0, "No yield");
        _balances[msg.sender] += amount;
        _totalDeposits += amount;
        _lastClaimTime[msg.sender] = block.timestamp;
        emit YieldClaimed(msg.sender, amount);
    }

    /**
     * @notice Pause deposits. Only PAUSER_ROLE.
     */
    function pauseDeposits() external onlyRole(PAUSER_ROLE) {
        _depositsPaused = true;
        emit DepositsPaused(msg.sender);
    }

    /**
     * @notice Unpause deposits. Only PAUSER_ROLE.
     */
    function unpauseDeposits() external onlyRole(PAUSER_ROLE) {
        _depositsPaused = false;
        emit DepositsUnpaused(msg.sender);
    }

    /**
     * @notice Returns true if deposits are paused.
     */
    function isDepositsPaused() external view returns (bool) {
        return _depositsPaused;
    }

    /**
     * @dev Override V1 deposit to respect pause and initialize claim timestamp.
     */
    function deposit(uint256 amount) public override {
        require(!_depositsPaused, "Deposits paused");
        super.deposit(amount);
        // Initialize/refresh claim baseline
        _lastClaimTime[msg.sender] = block.timestamp;
    }

    // Reduce gap: V1 had 46; V2 adds 3 new storage slots -> 43 remaining
    uint256[43] private __gap;
}
