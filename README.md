# 🌍 LearnSphere: Decentralized OER Peer-Review Network

Welcome to a groundbreaking platform that transforms global education through blockchain! LearnSphere creates a tokenized peer-review network for open educational resources (OER), addressing challenges like limited access to quality education, lack of contributor incentives, and unreliable open-source learning materials. Contributors submit OER (e.g., courses, textbooks, modules), which undergo peer review. Approved resources earn contributors credits (tokens) redeemable for real-world courses from partnered institutions worldwide. Reviewers are rewarded for honest participation, fostering a sustainable ecosystem.

Built on the Stacks blockchain using Clarity smart contracts, LearnSphere ensures transparency, immutability, and decentralized governance.

## ✨ Features

🔍 Submit and peer-review open educational resources  
💰 Earn tokenized credits (LearnTokens) for contributions and reviews  
🎓 Redeem credits for certified courses from global partners  
🏅 Reputation system to reward high-quality participants  
🗳️ Decentralized governance for platform updates  
🔒 Immutable records of submissions, reviews, and redemptions  
🚫 Anti-spam mechanisms via staking and penalties  
🌍 Integration with external oracles for course availability verification  

## 🛠 How It Works

**For Contributors**  
- Register as a user and submit your OER (e.g., a PDF, video link, or text module) with metadata.  
- Your submission enters a review queue where peers stake LearnTokens to participate in reviewing.  
- If approved by consensus, you earn LearnTokens based on quality scores.  

**For Reviewers**  
- Stake LearnTokens to join a review pool for a submission.  
- Provide detailed feedback and vote on approval.  
- Honest reviews (aligned with consensus) earn rewards; dishonest ones face penalties.  

**For Learners**  
- Browse approved OER for free.  
- Redeem accumulated LearnTokens for premium courses via partnered providers.  

**Token Economy**  
- LearnTokens are ERC-20-like tokens on Stacks.  
- Total supply is governed by the community to prevent inflation.  
- Redemptions are handled via oracles confirming off-chain course enrollments.  

LearnSphere solves key issues: It incentivizes high-quality OER creation, ensures peer-validated content, and bridges open resources with formal education, making learning accessible globally.

## 🔗 Smart Contracts Overview

This project leverages 8 Clarity smart contracts for a robust, decentralized implementation:

1. **UserRegistry.clar**: Manages user registrations, profiles, and roles (contributor, reviewer, learner). Tracks basic info like STX addresses and verification status.  

2. **ResourceSubmission.clar**: Handles OER submissions with hashes, metadata (title, description, category), and IPFS links for content storage. Emits events for new submissions.  

3. **PeerReviewPool.clar**: Creates review pools for each submission, allowing reviewers to stake LearnTokens and join. Manages review deadlines and participant lists.  

4. **ReviewVoting.clar**: Facilitates voting and feedback submission within pools. Calculates consensus scores using weighted averages based on reviewer reputation.  

5. **LearnToken.clar**: A fungible token contract for LearnTokens. Handles minting, burning, and transfers. Rewards are minted upon successful reviews or approvals.  

6. **ReputationSystem.clar**: Tracks reputation scores for users based on contribution quality and review accuracy. Uses algorithms to update scores post-consensus.  

7. **RedemptionGateway.clar**: Processes LearnToken redemptions for courses. Integrates with oracles to verify off-chain enrollments and burns tokens upon success.  

8. **GovernanceDAO.clar**: Enables LearnToken holders to propose and vote on platform changes, like reward rates or partnerships. Uses quadratic voting for fairness.  

These contracts interact seamlessly: For example, a successful review in ReviewVoting triggers minting in LearnToken and updates in ReputationSystem.

## 🚀 Getting Started

Deploy the contracts on Stacks testnet using Clarinet. Interact via the Stacks Wallet or custom DApp frontend. For full implementation details, check the `contracts/` directory in the repo.

Join the global learning revolution—contribute, review, and learn on-chain!
