import { assert } from 'chai'
import { deriveXAddress } from 'xrpl-local'

describe('deriveXAddress', () => {
  it('returns address for public key', () => {
    assert.equal(
      deriveXAddress({
        publicKey:
          '035332FBA71D705BD5D97014A833BE2BBB25BEFCD3506198E14AFEA241B98C2D06',
        tag: false,
        test: false,
      }),
      'XVZVpQj8YSVpNyiwXYSqvQoQqgBttTxAZwMcuJd4xteQHyt',
    )
    assert.equal(
      deriveXAddress({
        publicKey:
          '035332FBA71D705BD5D97014A833BE2BBB25BEFCD3506198E14AFEA241B98C2D06',
        tag: false,
        test: true,
      }),
      'TVVrSWtmQQssgVcmoMBcFQZKKf56QscyWLKnUyiuZW8ALU4',
    )
  })

  it('does not include tag when null', () => {
    assert.equal(
      deriveXAddress({
        publicKey:
          'ED02C98225BD1C79E9A4F95C6978026D300AFB7CA2A34358920BCFBCEBE6AFCD6A',
        // @ts-expect-error -- Assessing null behavior (Common js mistake)
        tag: null,
        test: false,
      }),
      'X7FbrqVEqdTNoX5qq94rTdarGjeVYmkxi8A1TKAJUnyLL9g',
    )
  })

  it('does not include tag when undefined', () => {
    assert.equal(
      deriveXAddress({
        publicKey:
          'ED02C98225BD1C79E9A4F95C6978026D300AFB7CA2A34358920BCFBCEBE6AFCD6A',
        // @ts-expect-error -- Assessing undefined behavior
        tag: undefined,
        test: false,
      }),
      'X7FbrqVEqdTNoX5qq94rTdarGjeVYmkxi8A1TKAJUnyLL9g',
    )
  })
})
