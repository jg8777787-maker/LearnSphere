// ReviewVoting.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Vote {
  score: number;
  feedback: string;
  reputationWeight: number;
  timestamp: number;
}

interface Pool {
  submissionId: number;
  startBlock: number;
  endBlock: number;
  requiredVotes: number;
  currentVotes: number;
  status: string;
  totalWeightedScore: number;
  totalWeight: number;
  disputeFlag: boolean;
  disputeResolutionBlock: number | null;
}

interface Dispute {
  initiator: string;
  reason: string;
  votesFor: number;
  votesAgainst: number;
  resolved: boolean;
  outcome: boolean | null;
}

interface ContractState {
  owner: string;
  votingFee: number;
  pools: Map<number, Pool>;
  votes: Map<string, Vote>; // Key: `${poolId}-${reviewer}`
  feedbackLists: Map<number, { feedbacks: string[] }>;
  disputes: Map<number, Dispute>;
  blockHeight: number; // Mock block height
  reputations: Map<string, number>; // Mock reputations
}

// Mock contract implementation
class ReviewVotingMock {
  private state: ContractState = {
    owner: "deployer",
    votingFee: 100,
    pools: new Map(),
    votes: new Map(),
    feedbackLists: new Map(),
    disputes: new Map(),
    blockHeight: 1000,
    reputations: new Map([["reviewer1", 50], ["reviewer2", 30], ["reviewer3", 70]]),
  };

  private MIN_SCORE = 0;
  private MAX_SCORE = 100;
  private MIN_REPUTATION_THRESHOLD = 10;
  private MAX_FEEDBACK_LEN = 500;
  private MIN_VOTES_REQUIRED = 3;
  private DISPUTE_WINDOW = 144;

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_INVALID_POOL = 101;
  private ERR_VOTING_CLOSED = 102;
  private ERR_ALREADY_VOTED = 103;
  private ERR_INVALID_SCORE = 104;
  private ERR_INVALID_FEEDBACK = 105;
  private ERR_INSUFFICIENT_REPUTATION = 106;
  private ERR_DISPUTE_ALREADY_RESOLVED = 107;
  private ERR_NO_DISPUTE = 108;
  private ERR_INVALID_WEIGHT = 109;
  private ERR_POOL_NOT_READY = 110;
  private ERR_MINIMUM_VOTES_NOT_MET = 111;
  private ERR_INVALID_TIMESTAMP = 112;
  private ERR_MAX_FEEDBACK_LENGTH = 113;

  // Mock block height increment
  private incrementBlockHeight(blocks: number = 1) {
    this.state.blockHeight += blocks;
  }

  getConsensusScore(poolId: number): ClarityResponse<number> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: this.ERR_INVALID_POOL };
    if (pool.totalWeight === 0) return { ok: false, value: this.ERR_INVALID_WEIGHT };
    return { ok: true, value: Math.floor(pool.totalWeightedScore / pool.totalWeight) };
  }

  getVote(poolId: number, reviewer: string): ClarityResponse<Vote | null> {
    const key = `${poolId}-${reviewer}`;
    return { ok: true, value: this.state.votes.get(key) ?? null };
  }

  getFeedbackList(poolId: number): ClarityResponse<string[]> {
    return { ok: true, value: this.state.feedbackLists.get(poolId)?.feedbacks ?? [] };
  }

  getPoolDetails(poolId: number): ClarityResponse<Pool | null> {
    return { ok: true, value: this.state.pools.get(poolId) ?? null };
  }

  getDisputeDetails(poolId: number): ClarityResponse<Dispute | null> {
    return { ok: true, value: this.state.disputes.get(poolId) ?? null };
  }

  submitVote(caller: string, poolId: number, score: number, feedback: string): ClarityResponse<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: this.ERR_INVALID_POOL };
    if (pool.status !== "open" || this.state.blockHeight > pool.endBlock || this.state.blockHeight < pool.startBlock) {
      return { ok: false, value: this.ERR_VOTING_CLOSED };
    }
    const key = `${poolId}-${caller}`;
    if (this.state.votes.has(key)) return { ok: false, value: this.ERR_ALREADY_VOTED };
    if (score < this.MIN_SCORE || score > this.MAX_SCORE) return { ok: false, value: this.ERR_INVALID_SCORE };
    if (feedback.length > this.MAX_FEEDBACK_LEN) return { ok: false, value: this.ERR_MAX_FEEDBACK_LENGTH };
    const reputation = this.state.reputations.get(caller) ?? 0;
    if (reputation < this.MIN_REPUTATION_THRESHOLD) return { ok: false, value: this.ERR_INSUFFICIENT_REPUTATION };

    // Assume STX transfer succeeds

    const weightedScore = score * reputation;
    pool.totalWeightedScore += weightedScore;
    pool.totalWeight += reputation;
    pool.currentVotes += 1;
    this.state.votes.set(key, { score, feedback, reputationWeight: reputation, timestamp: this.state.blockHeight });

    const feedbacks = this.state.feedbackLists.get(poolId)?.feedbacks ?? [];
    feedbacks.push(feedback);
    this.state.feedbackLists.set(poolId, { feedbacks });

    return { ok: true, value: true };
  }

  closeVoting(caller: string, poolId: number): ClarityResponse<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: this.ERR_INVALID_POOL };
    if (caller !== this.state.owner && this.state.blockHeight <= pool.endBlock) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (pool.status !== "open") return { ok: false, value: this.ERR_VOTING_CLOSED };
    if (pool.currentVotes < this.MIN_VOTES_REQUIRED) return { ok: false, value: this.ERR_MINIMUM_VOTES_NOT_MET };

    pool.status = "closed";
    return { ok: true, value: true };
  }

  initiateDispute(caller: string, poolId: number, reason: string): ClarityResponse<boolean> {
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: this.ERR_INVALID_POOL };
    if (pool.status !== "closed") return { ok: false, value: this.ERR_POOL_NOT_READY };
    if (this.state.blockHeight >= pool.endBlock + this.DISPUTE_WINDOW) return { ok: false, value: this.ERR_INVALID_TIMESTAMP };
    if (this.state.disputes.has(poolId)) return { ok: false, value: this.ERR_ALREADY_VOTED }; // Reuse

    this.state.disputes.set(poolId, {
      initiator: caller,
      reason,
      votesFor: 0,
      votesAgainst: 0,
      resolved: false,
      outcome: null,
    });
    pool.disputeFlag = true;
    pool.status = "disputed";
    return { ok: true, value: true };
  }

  voteOnDispute(caller: string, poolId: number, support: boolean): ClarityResponse<boolean> {
    const dispute = this.state.disputes.get(poolId);
    if (!dispute) return { ok: false, value: this.ERR_NO_DISPUTE };
    const pool = this.state.pools.get(poolId);
    if (!pool || !pool.disputeFlag) return { ok: false, value: this.ERR_NO_DISPUTE };
    if (dispute.resolved) return { ok: false, value: this.ERR_DISPUTE_ALREADY_RESOLVED };
    const key = `${poolId}-${caller}`;
    if (!this.state.votes.has(key)) return { ok: false, value: this.ERR_NOT_AUTHORIZED };

    const reputation = this.state.reputations.get(caller) ?? 0;
    if (support) {
      dispute.votesFor += reputation;
    } else {
      dispute.votesAgainst += reputation;
    }
    return { ok: true, value: true };
  }

  resolveDispute(caller: string, poolId: number): ClarityResponse<boolean> {
    const dispute = this.state.disputes.get(poolId);
    if (!dispute) return { ok: false, value: this.ERR_NO_DISPUTE };
    const pool = this.state.pools.get(poolId);
    if (!pool) return { ok: false, value: this.ERR_INVALID_POOL };
    if (caller !== this.state.owner && this.state.blockHeight <= pool.endBlock + this.DISPUTE_WINDOW + 144) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (dispute.resolved) return { ok: false, value: this.ERR_DISPUTE_ALREADY_RESOLVED };

    const upheld = dispute.votesFor > dispute.votesAgainst;
    dispute.resolved = true;
    dispute.outcome = upheld;
    if (upheld) {
      pool.status = "disputed-upheld";
      pool.totalWeightedScore = 0;
      pool.totalWeight = 0;
    } else {
      pool.status = "resolved";
      pool.disputeFlag = false;
    }
    return { ok: true, value: upheld };
  }

  setVotingFee(caller: string, newFee: number): ClarityResponse<boolean> {
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.votingFee = newFee;
    return { ok: true, value: true };
  }

  createMockPool(caller: string, poolId: number, submissionId: number, duration: number, requiredVotes: number): ClarityResponse<boolean> {
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    this.state.pools.set(poolId, {
      submissionId,
      startBlock: this.state.blockHeight,
      endBlock: this.state.blockHeight + duration,
      requiredVotes,
      currentVotes: 0,
      status: "open",
      totalWeightedScore: 0,
      totalWeight: 0,
      disputeFlag: false,
      disputeResolutionBlock: null,
    });
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  reviewer1: "reviewer1",
  reviewer2: "reviewer2",
  reviewer3: "reviewer3",
  unauthorized: "unauthorized",
};

describe("ReviewVoting Contract", () => {
  let contract: ReviewVotingMock;

  beforeEach(() => {
    contract = new ReviewVotingMock();
    vi.resetAllMocks();
  });

  it("should create a mock pool as owner", () => {
    const result = contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    expect(result).toEqual({ ok: true, value: true });
    const pool = contract.getPoolDetails(1).value;
    expect(pool?.status).toBe("open");
  });

  it("should prevent non-owner from creating pool", () => {
    const result = contract.createMockPool(accounts.unauthorized, 1, 100, 1000, 3);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow qualified reviewer to submit vote", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    const result = contract.submitVote(accounts.reviewer1, 1, 80, "Great content!");
    expect(result).toEqual({ ok: true, value: true });
    const vote = contract.getVote(1, accounts.reviewer1).value;
    expect(vote?.score).toBe(80);
    const consensus = contract.getConsensusScore(1).value;
    expect(consensus).toBe(80);
  });

  it("should prevent vote with invalid score", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    const result = contract.submitVote(accounts.reviewer1, 1, 150, "Invalid");
    expect(result).toEqual({ ok: false, value: 104 });
  });

  it("should prevent duplicate vote", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "First");
    const result = contract.submitVote(accounts.reviewer1, 1, 90, "Second");
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should close voting after sufficient votes", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    contract.submitVote(accounts.reviewer2, 1, 70, "B");
    contract.submitVote(accounts.reviewer3, 1, 90, "C");
    const result = contract.closeVoting(accounts.deployer, 1);
    expect(result).toEqual({ ok: true, value: true });
    const pool = contract.getPoolDetails(1).value;
    expect(pool?.status).toBe("closed");
  });

  it("should prevent closing with insufficient votes", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    const result = contract.closeVoting(accounts.deployer, 1);
    expect(result).toEqual({ ok: false, value: 111 });
  });

  it("should initiate dispute after closing", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    contract.submitVote(accounts.reviewer2, 1, 70, "B");
    contract.submitVote(accounts.reviewer3, 1, 90, "C");
    contract.closeVoting(accounts.deployer, 1);
    const result = contract.initiateDispute(accounts.reviewer1, 1, "Unfair scoring");
    expect(result).toEqual({ ok: true, value: true });
    const pool = contract.getPoolDetails(1).value;
    expect(pool?.status).toBe("disputed");
  });

  it("should allow voting on dispute", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    contract.submitVote(accounts.reviewer2, 1, 70, "B");
    contract.submitVote(accounts.reviewer3, 1, 90, "C");
    contract.closeVoting(accounts.deployer, 1);
    contract.initiateDispute(accounts.reviewer1, 1, "Unfair");
    const result = contract.voteOnDispute(accounts.reviewer2, 1, true);
    expect(result).toEqual({ ok: true, value: true });
    const dispute = contract.getDisputeDetails(1).value;
    expect(dispute?.votesFor).toBe(30);
  });

  it("should resolve dispute correctly", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    contract.submitVote(accounts.reviewer2, 1, 70, "B");
    contract.submitVote(accounts.reviewer3, 1, 90, "C");
    contract.closeVoting(accounts.deployer, 1);
    contract.initiateDispute(accounts.reviewer1, 1, "Unfair");
    contract.voteOnDispute(accounts.reviewer2, 1, true);
    contract.voteOnDispute(accounts.reviewer3, 1, false);
    const result = contract.resolveDispute(accounts.deployer, 1);
    expect(result).toEqual({ ok: true, value: false }); // Not upheld (30 > 70? No)
    const pool = contract.getPoolDetails(1).value;
    expect(pool?.status).toBe("resolved");
  });

  it("should reset scores if dispute upheld", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "A");
    contract.submitVote(accounts.reviewer2, 1, 70, "B");
    contract.submitVote(accounts.reviewer3, 1, 90, "C");
    contract.closeVoting(accounts.deployer, 1);
    contract.initiateDispute(accounts.reviewer1, 1, "Unfair");
    contract.voteOnDispute(accounts.reviewer1, 1, true); // 50
    contract.voteOnDispute(accounts.reviewer3, 1, true); // 70, total 120 > 0
    const result = contract.resolveDispute(accounts.deployer, 1);
    expect(result).toEqual({ ok: true, value: true });
    const pool = contract.getPoolDetails(1).value;
    expect(pool?.status).toBe("disputed-upheld");
    expect(pool?.totalWeightedScore).toBe(0);
  });

  it("should append feedbacks correctly", () => {
    contract.createMockPool(accounts.deployer, 1, 100, 1000, 3);
    contract.submitVote(accounts.reviewer1, 1, 80, "Feedback1");
    contract.submitVote(accounts.reviewer2, 1, 70, "Feedback2");
    const feedbacks = contract.getFeedbackList(1).value;
    expect(feedbacks).toEqual(["Feedback1", "Feedback2"]);
  });
});