import { describe, it, expect } from 'vitest'
import { GuidedWizard, TEST_DEFINITIONS } from './guided'

describe('GuidedWizard', () => {
  it('initializes with selected tests', () => {
    const wizard = new GuidedWizard(['noise-stability', 'drift'])
    expect(wizard.selectedTests).toHaveLength(2)
    expect(wizard.currentTestIndex).toBe(0)
    expect(wizard.phase).toBe('instruction')
  })

  it('advances through phases: instruction -> collecting -> result', () => {
    const wizard = new GuidedWizard(['noise-stability'])
    expect(wizard.phase).toBe('instruction')
    wizard.advance()
    expect(wizard.phase).toBe('collecting')
    wizard.advance()
    expect(wizard.phase).toBe('result')
  })

  it('advances to next test after result', () => {
    const wizard = new GuidedWizard(['noise-stability', 'drift'])
    wizard.advance(); wizard.advance(); wizard.advance()
    expect(wizard.currentTestIndex).toBe(1)
    expect(wizard.phase).toBe('instruction')
  })

  it('reports done after last test result', () => {
    const wizard = new GuidedWizard(['noise-stability'])
    wizard.advance(); wizard.advance(); wizard.advance()
    expect(wizard.isDone).toBe(true)
  })

  it('handles load-cell-bond mid-collection phase', () => {
    const wizard = new GuidedWizard(['load-cell-bond'])
    expect(wizard.phase).toBe('instruction')
    wizard.advance(); expect(wizard.phase).toBe('collecting')
    wizard.advance(); expect(wizard.phase).toBe('mid-action')
    wizard.advance(); expect(wizard.phase).toBe('collecting')
    wizard.advance(); expect(wizard.phase).toBe('result')
  })
})

describe('TEST_DEFINITIONS', () => {
  it('has all four tests defined', () => {
    const ids = TEST_DEFINITIONS.map(t => t.id)
    expect(ids).toContain('noise-stability')
    expect(ids).toContain('load-cell-bond')
    expect(ids).toContain('drift')
    expect(ids).toContain('connection-health')
  })
})
