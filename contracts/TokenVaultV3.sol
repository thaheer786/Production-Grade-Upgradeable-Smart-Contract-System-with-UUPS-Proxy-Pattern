// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TokenVaultV2} from "./TokenVaultV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenVaultV3
 * @notice Extends V2 with withdrawal delay and emergency withdrawal mechanisms.
 * @dev Appends new storage only; preserves layout from predecessors.
 */
contract TokenVaultV3 is TokenVaultV2 {
    // New state (V3)
    uint256 private _withdrawalDelay; // in seconds

    struct WithdrawalRequest { uint256 amount; uint256 requestTime; }
    mapping(address => WithdrawalRequest) private _withdrawals;

    // Events
    event WithdrawalDelayUpdated(uint256 delaySeconds);
    event WithdrawalRequested(address indexed user, uint256 amount, uint256 requestTime);
    event WithdrawalExecuted(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /**
     * @notice Set withdrawal delay in seconds. Only admin.
     */
    function setWithdrawalDelay(uint256 _delaySeconds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_delaySeconds <= 30 days, "Delay too long");
        _withdrawalDelay = _delaySeconds;
        emit WithdrawalDelayUpdated(_delaySeconds);
    }

    /**
     * @notice Get withdrawal delay.
     */
    function getWithdrawalDelay() external view returns (uint256) {
        return _withdrawalDelay;
    }

    /**
     * @notice Request a delayed withdrawal.
     */
    function requestWithdrawal(uint256 amount) external {
        require(amount > 0, "Amount=0");
        // read balance directly from V1 storage
        uint256 bal = _balances[msg.sender];
        require(bal >= amount, "Insufficient balance");
        _withdrawals[msg.sender] = WithdrawalRequest({amount: amount, requestTime: block.timestamp});
        emit WithdrawalRequested(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Execute a delayed withdrawal once the delay has passed.
     * @return amount Withdrawn amount.
     */
    function executeWithdrawal() external returns (uint256 amount) {
        WithdrawalRequest memory req = _withdrawals[msg.sender];
        require(req.amount > 0, "No request");
        require(block.timestamp >= req.requestTime + _withdrawalDelay, "Delay not passed");

        // reduce balance and total deposits
        amount = req.amount;
        _withdrawals[msg.sender] = WithdrawalRequest({amount: 0, requestTime: 0});

        _balances[msg.sender] -= amount;
        _totalDeposits -= amount;

        require(_token.transfer(msg.sender, amount), "Transfer failed");
        emit WithdrawalExecuted(msg.sender, amount);
    }

    /**
     * @notice Emergency withdraw full balance, bypassing delay.
     * @dev Clears any pending withdrawal request and transfers full balance.
     * @return amount Withdrawn amount.
     */
    function emergencyWithdraw() external returns (uint256 amount) {
        // read full balance
        uint256 bal = _balances[msg.sender];
        require(bal > 0, "No balance");
        // clear any pending request
        _withdrawals[msg.sender] = WithdrawalRequest({amount: 0, requestTime: 0});

        amount = bal;

        _totalDeposits -= amount;
        _balances[msg.sender] = 0;

        require(_token.transfer(msg.sender, amount), "Transfer failed");
        emit EmergencyWithdraw(msg.sender, amount);
    }

    /**
     * @notice Get pending withdrawal request details for a user.
     */
    function getWithdrawalRequest(address user) external view returns (uint256 amount, uint256 requestTime) {
        WithdrawalRequest memory req = _withdrawals[user];
        return (req.amount, req.requestTime);
    }

    // V3 adds 2 slots -> reduce gap accordingly: V2 had 43; now 41 remaining
    uint256[41] private __gap;
}
