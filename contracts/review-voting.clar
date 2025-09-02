;; ReviewVoting.clar
;; Core contract for facilitating peer-review voting and consensus calculation in LearnSphere
;; Handles vote submission, feedback, weighted consensus scoring based on reputation,
;; dispute resolution, and integration with other contracts.

;; Constants
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-POOL u101)
(define-constant ERR-VOTING-CLOSED u102)
(define-constant ERR-ALREADY-VOTED u103)
(define-constant ERR-INVALID-SCORE u104)
(define-constant ERR-INVALID-FEEDBACK u105)
(define-constant ERR-INSUFFICIENT-REPUTATION u106)
(define-constant ERR-DISPUTE-ALREADY-RESOLVED u107)
(define-constant ERR-NO-DISPUTE u108)
(define-constant ERR-INVALID-WEIGHT u109)
(define-constant ERR-POOL-NOT-READY u110)
(define-constant ERR-MINIMUM-VOTES-NOT-MET u111)
(define-constant ERR-INVALID-TIMESTAMP u112)
(define-constant ERR-MAX-FEEDBACK-LENGTH u113)
(define-constant MIN-SCORE u0)
(define-constant MAX-SCORE u100)
(define-constant MIN-REPUTATION-THRESHOLD u10)
(define-constant MAX-FEEDBACK-LEN u500)
(define-constant MIN-VOTES-REQUIRED u3)
(define-constant DISPUTE_WINDOW u144) ;; ~1 day in blocks

;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var voting-fee uint u100) ;; STX fee for voting, adjustable

;; Data Maps
;; Review Pools (assumed from PeerReviewPool.clar, but mocked here for standalone)
(define-map review-pools
  { pool-id: uint }
  {
    submission-id: uint,
    start-block: uint,
    end-block: uint,
    required-votes: uint,
    current-votes: uint,
    status: (string-ascii 20), ;; "open", "closed", "disputed", "resolved"
    total-weighted-score: uint,
    total-weight: uint,
    dispute-flag: bool,
    dispute-resolution-block: (optional uint)
  }
)

;; Votes per reviewer per pool
(define-map votes
  { pool-id: uint, reviewer: principal }
  {
    score: uint, ;; 0-100 quality score
    feedback: (string-utf8 500),
    reputation-weight: uint, ;; Fetched from ReputationSystem
    timestamp: uint
  }
)

;; Aggregated feedback lists
(define-map feedback-lists
  { pool-id: uint }
  { feedbacks: (list 50 (string-utf8 500)) }
)

;; Disputes
(define-map disputes
  { pool-id: uint }
  {
    initiator: principal,
    reason: (string-utf8 200),
    votes-for: uint,
    votes-against: uint,
    resolved: bool,
    outcome: (optional bool) ;; true if dispute upheld
  }
)

;; Private Functions
(define-private (is-pool-open (pool-id uint))
  (let ((pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL))))
    (and
      (is-eq (get status pool) "open")
      (>= (get end-block pool) block-height)
      (<= (get start-block pool) block-height)
    )
  )
)

(define-private (get-reputation (reviewer principal))
  ;; Mock call to ReputationSystem.clar; in real: (contract-call? .reputation-system get-reputation reviewer)
  (ok u50) ;; Mock reputation score
)

(define-private (calculate-weighted-score (score uint) (weight uint))
  (* score weight)
)

(define-private (update-pool-scores (pool-id uint) (weighted-score uint) (weight uint))
  (let ((pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL))))
    (map-set review-pools {pool-id: pool-id}
      (merge pool {
        total-weighted-score: (+ (get total-weighted-score pool) weighted-score),
        total-weight: (+ (get total-weight pool) weight),
        current-votes: (+ (get current-votes pool) u1)
      })
    )
    (ok true)
  )
)

(define-private (append-feedback (pool-id uint) (feedback (string-utf8 500)))
  (let ((current (default-to {feedbacks: (list)} (map-get? feedback-lists {pool-id: pool-id}))))
    (map-set feedback-lists {pool-id: pool-id}
      {feedbacks: (unwrap! (as-max-len? (append (get feedbacks current) feedback) u50) (err ERR-INVALID-FEEDBACK))}
    )
    (ok true)
  )
)

;; Public Functions
(define-public (submit-vote (pool-id uint) (score uint) (feedback (string-utf8 500)))
  (let
    (
      (reviewer tx-sender)
      (rep-response (get-reputation reviewer))
      (reputation (unwrap! rep-response (err ERR-NOT-AUTHORIZED)))
    )
    (asserts! (is-pool-open pool-id) (err ERR-VOTING-CLOSED))
    (asserts! (is-none (map-get? votes {pool-id: pool-id, reviewer: reviewer})) (err ERR-ALREADY-VOTED))
    (asserts! (and (>= score MIN-SCORE) (<= score MAX-SCORE)) (err ERR-INVALID-SCORE))
    (asserts! (<= (len feedback) MAX-FEEDBACK-LEN) (err ERR-MAX-FEEDBACK-LENGTH))
    (asserts! (>= reputation MIN-REPUTATION-THRESHOLD) (err ERR-INSUFFICIENT-REPUTATION))
    
    ;; Charge voting fee (STX transfer to contract)
    (try! (stx-transfer? (var-get voting-fee) tx-sender (as-contract tx-sender)))
    
    (let ((weighted-score (calculate-weighted-score score reputation)))
      (try! (update-pool-scores pool-id weighted-score reputation))
      (map-set votes {pool-id: pool-id, reviewer: reviewer}
        {
          score: score,
          feedback: feedback,
          reputation-weight: reputation,
          timestamp: block-height
        }
      )
      (try! (append-feedback pool-id feedback))
      ;; Emit event (in real Clarity, use print)
      (print {event: "vote-submitted", pool-id: pool-id, reviewer: reviewer, score: score})
      (ok true)
    )
  )
)

(define-public (close-voting (pool-id uint))
  (let ((pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL))))
    (asserts! (or (is-eq tx-sender (var-get contract-owner)) (> block-height (get end-block pool))) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status pool) "open") (err ERR-VOTING-CLOSED))
    (asserts! (>= (get current-votes pool) MIN-VOTES-REQUIRED) (err ERR-MINIMUM-VOTES-NOT-MET))
    
    (map-set review-pools {pool-id: pool-id}
      (merge pool {status: "closed"})
    )
    ;; Trigger reward distribution (mock call to RewardToken.clar)
    (print {event: "voting-closed", pool-id: pool-id})
    (ok true)
  )
)

(define-public (initiate-dispute (pool-id uint) (reason (string-utf8 200)))
  (let ((pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL))))
    (asserts! (is-eq (get status pool) "closed") (err ERR-POOL-NOT-READY))
    (asserts! (< block-height (+ (get end-block pool) DISPUTE_WINDOW)) (err ERR-INVALID-TIMESTAMP))
    (asserts! (is-none (map-get? disputes {pool-id: pool-id})) (err ERR-ALREADY-VOTED)) ;; Reuse error for simplicity
    
    (map-set disputes {pool-id: pool-id}
      {
        initiator: tx-sender,
        reason: reason,
        votes-for: u0,
        votes-against: u0,
        resolved: false,
        outcome: none
      }
    )
    (map-set review-pools {pool-id: pool-id}
      (merge pool {dispute-flag: true, status: "disputed"})
    )
    (print {event: "dispute-initiated", pool-id: pool-id, initiator: tx-sender})
    (ok true)
  )
)

(define-public (vote-on-dispute (pool-id uint) (support bool))
  (let
    (
      (dispute (unwrap! (map-get? disputes {pool-id: pool-id}) (err ERR-NO-DISPUTE)))
      (pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL)))
      (rep-response (get-reputation tx-sender))
      (reputation (unwrap! rep-response (err ERR-NOT-AUTHORIZED)))
    )
    (asserts! (get dispute-flag pool) (err ERR-NO-DISPUTE))
    (asserts! (not (get resolved dispute)) (err ERR-DISPUTE-ALREADY-RESOLVED))
    (asserts! (is-some (map-get? votes {pool-id: pool-id, reviewer: tx-sender})) (err ERR-NOT-AUTHORIZED)) ;; Only original reviewers
    
    (if support
      (map-set disputes {pool-id: pool-id}
        (merge dispute {votes-for: (+ (get votes-for dispute) reputation)}))
      (map-set disputes {pool-id: pool-id}
        (merge dispute {votes-against: (+ (get votes-against dispute) reputation)}))
    )
    (ok true)
  )
)

(define-public (resolve-dispute (pool-id uint))
  (let
    (
      (dispute (unwrap! (map-get? disputes {pool-id: pool-id}) (err ERR-NO-DISPUTE)))
      (pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL)))
    )
    (asserts! (or (is-eq tx-sender (var-get contract-owner)) (> block-height (+ (get end-block pool) DISPUTE_WINDOW u144))) (err ERR-NOT-AUTHORIZED)) ;; Extra window for resolution
    (asserts! (not (get resolved dispute)) (err ERR-DISPUTE-ALREADY-RESOLVED))
    
    (let ((upheld (> (get votes-for dispute) (get votes-against dispute))))
      (map-set disputes {pool-id: pool-id}
        (merge dispute {resolved: true, outcome: (some upheld)}))
      (if upheld
        (map-set review-pools {pool-id: pool-id}
          (merge pool {status: "disputed-upheld", total-weighted-score: u0, total-weight: u0})) ;; Reset scores
        (map-set review-pools {pool-id: pool-id}
          (merge pool {status: "resolved", dispute-flag: false}))
      )
      (print {event: "dispute-resolved", pool-id: pool-id, upheld: upheld})
      (ok upheld)
    )
  )
)

;; Read-only Functions
(define-read-only (get-consensus-score (pool-id uint))
  (let ((pool (unwrap! (map-get? review-pools {pool-id: pool-id}) (err ERR-INVALID-POOL))))
    (if (> (get total-weight pool) u0)
      (ok (/ (get total-weighted-score pool) (get total-weight pool)))
      (err ERR-INVALID-WEIGHT)
    )
  )
)

(define-read-only (get-vote (pool-id uint) (reviewer principal))
  (map-get? votes {pool-id: pool-id, reviewer: reviewer})
)

(define-read-only (get-feedback-list (pool-id uint))
  (ok (get feedbacks (default-to {feedbacks: (list)} (map-get? feedback-lists {pool-id: pool-id}))))
)

(define-read-only (get-pool-details (pool-id uint))
  (map-get? review-pools {pool-id: pool-id})
)

(define-read-only (get-dispute-details (pool-id uint))
  (map-get? disputes {pool-id: pool-id})
)

;; Admin Functions
(define-public (set-voting-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set voting-fee new-fee)
    (ok true)
  )
)

(define-public (withdraw-fees (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (as-contract (stx-transfer? amount tx-sender recipient))
  )
)

;; Initialization (mock pool creation for testing)
(define-public (create-mock-pool (pool-id uint) (submission-id uint) (duration uint) (required-votes uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (map-set review-pools {pool-id: pool-id}
      {
        submission-id: submission-id,
        start-block: block-height,
        end-block: (+ block-height duration),
        required-votes: required-votes,
        current-votes: u0,
        status: "open",
        total-weighted-score: u0,
        total-weight: u0,
        dispute-flag: false,
        dispute-resolution-block: none
      }
    )
    (ok true)
  )
)