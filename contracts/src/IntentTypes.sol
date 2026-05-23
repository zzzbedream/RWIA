// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IntentTypes — EIP-712 typed-data definitions for RWIA V1
/// @notice V1 settles natively: a Keeper, having already received fiat from the
///         user off-chain, transfers a specific NFT to the user's wallet
///         on-chain. The intent records the off-chain payment side
///         (`tokenAddress`, `amount`) for accounting / auditability.
library IntentTypes {
    /// @notice User-signed intent to receive a specific NFT in exchange for an
    ///         off-chain (fiat or stablecoin) payment.
    /// @param user         Recipient that signed the intent. NFT will be sent
    ///                     here. Cannot be address(0).
    /// @param tokenAddress Token the user paid with off-chain. Recorded for
    ///                     auditing; the contract does NOT transfer it.
    /// @param amount       Amount the user paid off-chain (token decimals).
    /// @param nftContract  ERC-721 contract of the NFT being delivered.
    /// @param tokenId      Specific token id of the NFT being delivered.
    /// @param deadline     Unix seconds after which the intent cannot be
    ///                     executed (strict `>`).
    /// @param nonce        Arbitrary uint256 from the frontend to disambiguate
    ///                     otherwise identical intents from the same user.
    struct UserIntent {
        address user;
        address tokenAddress;
        uint256 amount;
        address nftContract;
        uint256 tokenId;
        uint256 deadline;
        uint256 nonce;
    }

    /// @dev EIP-712 type hash. Keep in sync with the struct above. Trailing
    ///      whitespace and field order MATTER for hashing.
    bytes32 internal constant USER_INTENT_TYPEHASH = keccak256(
        "UserIntent(address user,address tokenAddress,uint256 amount,address nftContract,uint256 tokenId,uint256 deadline,uint256 nonce)"
    );

    /// @notice EIP-712 struct hash for a UserIntent. Combine with the domain
    ///         separator to produce the digest the user signs.
    function hashStruct(UserIntent memory intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                USER_INTENT_TYPEHASH,
                intent.user,
                intent.tokenAddress,
                intent.amount,
                intent.nftContract,
                intent.tokenId,
                intent.deadline,
                intent.nonce
            )
        );
    }
}
