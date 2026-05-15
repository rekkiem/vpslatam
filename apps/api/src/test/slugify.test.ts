import { describe, it, expect } from 'vitest'
import { slugify } from '../utils/slugify'

describe('slugify', () => {
  it('lowercases and trims', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
  })

  it('replaces spaces with dashes', () => {
    expect(slugify('My Cool Project')).toBe('my-cool-project')
  })

  it('strips accents and diacritics', () => {
    expect(slugify('Güía de Producción')).toBe('guia-de-produccion')
    expect(slugify('ñoño')).toBe('nono')
    expect(slugify('héroe')).toBe('heroe')
  })

  it('collapses multiple non-alphanumeric chars', () => {
    expect(slugify('hello---world')).toBe('hello-world')
    expect(slugify('hello...world')).toBe('hello-world')
    expect(slugify('a  b  c')).toBe('a-b-c')
  })

  it('strips leading and trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello')
  })

  it('handles special characters', () => {
    expect(slugify('my_project@v2.0!')).toBe('my-project-v2-0')
  })

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBeLessThanOrEqual(50)
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('handles numbers', () => {
    expect(slugify('Project 123')).toBe('project-123')
  })

  it('handles already-valid slug', () => {
    expect(slugify('my-project')).toBe('my-project')
  })
})
