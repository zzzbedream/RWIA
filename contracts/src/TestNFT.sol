// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RWIA TestNFT
 * @notice Simple ERC-721 for testing the IntentAggregator on Ronin Mainnet.
 *         The owner (keeper) can mint NFTs that users purchase via gasless intents.
 */
contract TestNFT is ERC721, Ownable {
    uint256 private _nextTokenId = 1;

    constructor() ERC721("RWIA Test NFT", "RWIA") Ownable(msg.sender) {}

    /// @notice Mint an NFT to `to`
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 id = _nextTokenId++;
        _safeMint(to, id);
        return id;
    }

    /// @notice Batch mint NFTs to the owner for testing
    function batchMint(uint256 count) external onlyOwner {
        for (uint256 i = 0; i < count; i++) {
            uint256 id = _nextTokenId++;
            _safeMint(msg.sender, id);
        }
    }

    /// @notice Total supply
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
