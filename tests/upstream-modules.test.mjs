/**
 * Upstream module smoke tests
 *
 * Verify that all 16 upstream createXxx() factories work with zero-arg config
 * and return objects with expected method names.
 */

// Detect if upstream guidance is available
let upstreamAvailable = false;
try {
  await import('@claude-flow/guidance/coherence');
  upstreamAvailable = true;
} catch {}

describe('upstream module smoke tests', { skip: !upstreamAvailable }, () => {

  describe('coherence', () => {
    it('createCoherenceScheduler() returns expected interface', async () => {
      const { createCoherenceScheduler } = await import('@claude-flow/guidance/coherence');
      const scheduler = createCoherenceScheduler();
      expect(typeof scheduler.computeCoherence).toBe('function');
      expect(typeof scheduler.getPrivilegeLevel).toBe('function');
      expect(typeof scheduler.isHealthy).toBe('function');
      expect(typeof scheduler.isDrifting).toBe('function');
      expect(typeof scheduler.shouldRestrict).toBe('function');
      expect(typeof scheduler.getRecommendation).toBe('function');
    });

    it('createEconomicGovernor() returns expected interface', async () => {
      const { createEconomicGovernor } = await import('@claude-flow/guidance/coherence');
      const gov = createEconomicGovernor();
      expect(typeof gov.recordTokenUsage).toBe('function');
      expect(typeof gov.recordToolCall).toBe('function');
      expect(typeof gov.checkBudget).toBe('function');
      expect(typeof gov.getUsageSummary).toBe('function');
    });
  });

  describe('continue-gate', () => {
    it('createContinueGate() returns expected interface', async () => {
      const { createContinueGate } = await import('@claude-flow/guidance/continue-gate');
      const gate = createContinueGate();
      expect(typeof gate.evaluate).toBe('function');
      expect(typeof gate.getStats).toBe('function');
      expect(typeof gate.reset).toBe('function');
    });

    it('evaluate with defaults returns continue', async () => {
      const { createContinueGate } = await import('@claude-flow/guidance/continue-gate');
      const gate = createContinueGate();
      const result = gate.evaluate({
        stepNumber: 0,
        coherenceScore: 1.0,
        reworkRatio: 0,
        uncertaintyScore: 0,
        lastCheckpointStep: 0,
        budgetRemaining: { tokens: 10000, toolCalls: 100, timeMs: 60000 },
      });
      expect(result.decision).toBe('continue');
    });
  });

  describe('authority', () => {
    it('createAuthorityGate() returns expected interface', async () => {
      const { createAuthorityGate } = await import('@claude-flow/guidance/authority');
      const gate = createAuthorityGate();
      expect(typeof gate.canPerform).toBe('function');
      expect(typeof gate.requiresEscalation).toBe('function');
      expect(typeof gate.getMinimumAuthority).toBe('function');
      expect(typeof gate.recordIntervention).toBe('function');
      expect(typeof gate.getInterventions).toBe('function');
    });

    it('createIrreversibilityClassifier() returns expected interface', async () => {
      const { createIrreversibilityClassifier } = await import('@claude-flow/guidance/authority');
      const classifier = createIrreversibilityClassifier();
      expect(typeof classifier.classify).toBe('function');
      expect(typeof classifier.getRequiredProofLevel).toBe('function');
      expect(typeof classifier.requiresPreCommitSimulation).toBe('function');
    });
  });

  describe('meta-governance', () => {
    it('createMetaGovernor() returns expected interface', async () => {
      const { createMetaGovernor } = await import('@claude-flow/guidance/meta-governance');
      const gov = createMetaGovernor();
      expect(typeof gov.addInvariant).toBe('function');
      expect(typeof gov.checkAllInvariants).toBe('function');
      expect(typeof gov.validateOptimizerAction).toBe('function');
      expect(typeof gov.getInvariants).toBe('function');
      expect(typeof gov.getPendingAmendments).toBe('function');
    });
  });

  describe('optimizer', () => {
    it('createOptimizer() returns expected interface', async () => {
      const { createOptimizer } = await import('@claude-flow/guidance/optimizer');
      const opt = createOptimizer();
      expect(typeof opt.runCycle).toBe('function');
      expect(typeof opt.proposeChanges).toBe('function');
    });
  });

  describe('truth-anchors', () => {
    it('createTruthAnchorStore() returns expected interface', async () => {
      const { createTruthAnchorStore } = await import('@claude-flow/guidance/truth-anchors');
      const store = createTruthAnchorStore({ signingKey: 'test-key-for-smoke' });
      expect(typeof store.anchor).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof store.verify).toBe('function');
      expect(typeof store.resolve).toBe('function');
    });

    it('createTruthResolver() returns expected interface', async () => {
      const { createTruthAnchorStore, createTruthResolver } = await import('@claude-flow/guidance/truth-anchors');
      const store = createTruthAnchorStore({ signingKey: 'test-key-for-smoke' });
      const resolver = createTruthResolver(store);
      expect(typeof resolver.resolveMemoryConflict).toBe('function');
      expect(typeof resolver.resolveDecisionConflict).toBe('function');
    });
  });

  describe('uncertainty', () => {
    it('createUncertaintyLedger() returns expected interface', async () => {
      const { createUncertaintyLedger } = await import('@claude-flow/guidance/uncertainty');
      const ledger = createUncertaintyLedger();
      expect(typeof ledger.assert).toBe('function');
      expect(typeof ledger.computeConfidence).toBe('function');
      expect(typeof ledger.isActionable).toBe('function');
      expect(typeof ledger.getContested).toBe('function');
    });

    it('createUncertaintyAggregator() returns expected interface', async () => {
      const { createUncertaintyLedger, createUncertaintyAggregator } = await import('@claude-flow/guidance/uncertainty');
      const ledger = createUncertaintyLedger();
      const agg = createUncertaintyAggregator(ledger);
      expect(typeof agg.aggregate).toBe('function');
      expect(typeof agg.worstCase).toBe('function');
      expect(typeof agg.bestCase).toBe('function');
    });
  });

  describe('temporal', () => {
    it('createTemporalStore() returns expected interface', async () => {
      const { createTemporalStore } = await import('@claude-flow/guidance/temporal');
      const store = createTemporalStore();
      expect(typeof store.assert).toBe('function');
      expect(typeof store.getActiveAt).toBe('function');
      expect(typeof store.reconcile).toBe('function');
      expect(typeof store.pruneExpired).toBe('function');
    });

    it('createTemporalReasoner() returns expected interface', async () => {
      const { createTemporalStore, createTemporalReasoner } = await import('@claude-flow/guidance/temporal');
      const store = createTemporalStore();
      const reasoner = createTemporalReasoner(store);
      expect(typeof reasoner.whatIsTrue).toBe('function');
      expect(typeof reasoner.whatWasTrue).toBe('function');
      expect(typeof reasoner.whatWillBeTrue).toBe('function');
    });
  });

  describe('capabilities', () => {
    it('createCapabilityAlgebra() returns expected interface', async () => {
      const { createCapabilityAlgebra } = await import('@claude-flow/guidance/capabilities');
      const cap = createCapabilityAlgebra();
      expect(typeof cap.grant).toBe('function');
      expect(typeof cap.check).toBe('function');
      expect(typeof cap.delegate).toBe('function');
      expect(typeof cap.revoke).toBe('function');
      expect(typeof cap.getCapabilities).toBe('function');
    });
  });

  describe('artifacts', () => {
    it('createArtifactLedger() returns expected interface', async () => {
      const { createArtifactLedger } = await import('@claude-flow/guidance/artifacts');
      const ledger = createArtifactLedger({ signingKey: 'test-key-for-smoke' });
      expect(typeof ledger.record).toBe('function');
      expect(typeof ledger.verify).toBe('function');
      expect(typeof ledger.getStats).toBe('function');
    });
  });

  describe('manifest-validator', () => {
    it('createManifestValidator() returns expected interface', async () => {
      const { createManifestValidator } = await import('@claude-flow/guidance/manifest-validator');
      const validator = createManifestValidator();
      expect(typeof validator.validate).toBe('function');
      expect(typeof validator.computeRiskScore).toBe('function');
      expect(typeof validator.selectLane).toBe('function');
    });
  });

  describe('gateway', () => {
    it('createToolGateway() returns expected interface', async () => {
      const { createToolGateway } = await import('@claude-flow/guidance/gateway');
      const gw = createToolGateway();
      expect(typeof gw.evaluate).toBe('function');
      expect(typeof gw.recordCall).toBe('function');
      expect(typeof gw.checkBudget).toBe('function');
    });
  });

  describe('persistence', () => {
    it('createPersistentLedger() returns expected interface', async () => {
      const { createPersistentLedger } = await import('@claude-flow/guidance/persistence');
      const ledger = createPersistentLedger();
      expect(typeof ledger.init).toBe('function');
      expect(typeof ledger.save).toBe('function');
      expect(typeof ledger.load).toBe('function');
      expect(typeof ledger.compact).toBe('function');
      expect(typeof ledger.destroy).toBe('function');
    });
  });
});
