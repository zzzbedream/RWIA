export const intentAggregatorAbi = [
    {
        type: "function",
        name: "executeLocalIntent",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "intent",
                type: "tuple",
                components: [
                    {name: "user", type: "address"},
                    {name: "tokenAddress", type: "address"},
                    {name: "amount", type: "uint256"},
                    {name: "nftContract", type: "address"},
                    {name: "tokenId", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                ],
            },
            {name: "signature", type: "bytes"},
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "hashIntent",
        stateMutability: "view",
        inputs: [
            {
                name: "intent",
                type: "tuple",
                components: [
                    {name: "user", type: "address"},
                    {name: "tokenAddress", type: "address"},
                    {name: "amount", type: "uint256"},
                    {name: "nftContract", type: "address"},
                    {name: "tokenId", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                ],
            },
        ],
        outputs: [{type: "bytes32"}],
    },
    {
        type: "function",
        name: "verifyIntentSignature",
        stateMutability: "view",
        inputs: [
            {
                name: "intent",
                type: "tuple",
                components: [
                    {name: "user", type: "address"},
                    {name: "tokenAddress", type: "address"},
                    {name: "amount", type: "uint256"},
                    {name: "nftContract", type: "address"},
                    {name: "tokenId", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                ],
            },
            {name: "signature", type: "bytes"},
        ],
        outputs: [{type: "bool"}],
    },
    {
        type: "function",
        name: "isIntentExecuted",
        stateMutability: "view",
        inputs: [{name: "intentHash", type: "bytes32"}],
        outputs: [{type: "bool"}],
    },
    {
        type: "function",
        name: "paused",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "bool"}],
    },
    {
        type: "function",
        name: "hasRole",
        stateMutability: "view",
        inputs: [
            {name: "role", type: "bytes32"},
            {name: "account", type: "address"},
        ],
        outputs: [{type: "bool"}],
    },
    {
        type: "function",
        name: "KEEPER_ROLE",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "bytes32"}],
    },
    {
        type: "event",
        name: "IntentExecuted",
        inputs: [
            {indexed: true, name: "intentHash", type: "bytes32"},
            {indexed: true, name: "user", type: "address"},
            {indexed: true, name: "nftContract", type: "address"},
            {indexed: false, name: "tokenId", type: "uint256"},
            {indexed: false, name: "tokenAddress", type: "address"},
            {indexed: false, name: "amount", type: "uint256"},
            {indexed: false, name: "keeper", type: "address"},
        ],
    },
    // --- Custom errors so viem can decode reverts ----------------------------
    {type: "error", name: "ZeroAddress", inputs: []},
    {type: "error", name: "ZeroAmount", inputs: []},
    {
        type: "error",
        name: "IntentExpired",
        inputs: [
            {name: "deadline", type: "uint256"},
            {name: "currentTimestamp", type: "uint256"},
        ],
    },
    {type: "error", name: "InvalidSignature", inputs: []},
    {
        type: "error",
        name: "IntentAlreadyExecuted",
        inputs: [{name: "intentHash", type: "bytes32"}],
    },
    {type: "error", name: "InvalidNftContract", inputs: []},
    // OpenZeppelin AccessControl / Pausable / ERC721 errors ------------------
    {
        type: "error",
        name: "AccessControlUnauthorizedAccount",
        inputs: [
            {name: "account", type: "address"},
            {name: "neededRole", type: "bytes32"},
        ],
    },
    {type: "error", name: "EnforcedPause", inputs: []},
    {type: "error", name: "ExpectedPause", inputs: []},
    {
        type: "error",
        name: "ERC721IncorrectOwner",
        inputs: [
            {name: "sender", type: "address"},
            {name: "tokenId", type: "uint256"},
            {name: "owner", type: "address"},
        ],
    },
    {
        type: "error",
        name: "ERC721InsufficientApproval",
        inputs: [
            {name: "operator", type: "address"},
            {name: "tokenId", type: "uint256"},
        ],
    },
    {
        type: "error",
        name: "ERC721NonexistentToken",
        inputs: [{name: "tokenId", type: "uint256"}],
    },
] as const;

export const erc721Abi = [
    {
        type: "function",
        name: "ownerOf",
        stateMutability: "view",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{type: "address"}],
    },
    {
        type: "function",
        name: "tokenURI",
        stateMutability: "view",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{type: "string"}],
    },
] as const;
