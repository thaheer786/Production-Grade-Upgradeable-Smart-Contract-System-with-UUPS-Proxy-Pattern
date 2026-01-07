// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenVaultV1
 * @notice Upgradeable token vault with deposit/withdraw and deposit fee using UUPS proxy pattern.
 * @dev Uses OpenZeppelin Initializable + UUPSUpgradeable + AccessControlUpgradeable.
 *      Storage layout must be preserved across upgrades. New variables must be appended only.
 */
contract TokenVaultV1 is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    // Roles
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    // Declared for future versions (V2+); constants do not consume storage
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // State variables (V1)
    IERC20 internal _token;
    mapping(address => uint256) internal _balances;
    uint256 internal _totalDeposits;
    uint256 internal _depositFee; // basis points (e.g., 500 = 5%)

    // Events
    event Initialized(address indexed token, address indexed admin, uint256 depositFeeBps);
    event Deposit(address indexed user, uint256 amount, uint256 feeBps, uint256 feeAmount, uint256 netAmount);
    event Withdraw(address indexed user, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the vault implementation via proxy.
     * @param _tokenAddr ERC20 token address to vault.
     * @param _admin Admin address to receive DEFAULT_ADMIN_ROLE, UPGRADER_ROLE, and PAUSER_ROLE.
     * @param _depositFeeBps Deposit fee in basis points (0-10000).
     */
    function initialize(address _tokenAddr, address _admin, uint256 _depositFeeBps) external initializer {
        require(_tokenAddr != address(0), "Invalid token");
        require(_admin != address(0), "Invalid admin");
        require(_depositFeeBps <= 10000, "Fee too high");

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _token = IERC20(_tokenAddr);
        _depositFee = _depositFeeBps;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
        // Pre-grant for future use in V2+
        _grantRole(PAUSER_ROLE, _admin);

        emit Initialized(_tokenAddr, _admin, _depositFeeBps);
    }

    /**
     * @notice Deposit `amount` tokens. Applies fee and credits net to user's internal balance.
     * @param amount Amount of tokens to deposit.
     */
    function deposit(uint256 amount) public virtual {
        require(amount > 0, "Amount=0");
        uint256 fee = (amount * _depositFee) / 10000;
        uint256 net = amount - fee;
        require(net > 0, "Net=0");

        // Pull tokens
        require(_token.transferFrom(msg.sender, address(this), amount), "TransferFrom failed");

        // Credit internal accounting
        _balances[msg.sender] += net;
        _totalDeposits += net;

        emit Deposit(msg.sender, amount, _depositFee, fee, net);
    }

    /**
     * @notice Withdraw `amount` tokens from internal balance.
     * @param amount Amount to withdraw.
     */
    function withdraw(uint256 amount) public virtual {
        require(amount > 0, "Amount=0");
        uint256 bal = _balances[msg.sender];
        require(bal >= amount, "Insufficient balance");

        _balances[msg.sender] = bal - amount;
        _totalDeposits -= amount;

        require(_token.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Get user internal balance.
     */
    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    /**
     * @notice Get total deposits tracked by the vault (net of fees).
     */
    function totalDeposits() external view returns (uint256) {
        return _totalDeposits;
    }

    /**
     * @notice Current deposit fee basis points.
     */
    function getDepositFee() external view returns (uint256) {
        return _depositFee;
    }

    /**
     * @notice Version identifier for implementation.
     */
    function getImplementationVersion() external pure returns (string memory) {
        return "V1";
    }

    /**
     * @dev UUPS upgrade authorization.
     */
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // Storage gap for future variable additions. Keep reducing the size in later versions as new variables are appended.
    uint256[46] private __gap; // V1 uses 4 slots, reserve remaining (typical pattern ~50 total)
}
