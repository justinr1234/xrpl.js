export type LedgerIndex = number | ('validated' | 'closed' | 'current')

export type AccountObjectType =
  | 'check'
  | 'deposit_preauth'
  | 'escrow'
  | 'offer'
  | 'payment_channel'
  | 'signer_list'
  | 'ticket'
  | 'state'

interface XRP {
  currency: 'XRP'
}

interface IssuedCurrency {
  currency: string
  issuer: string
}

export type Currency = IssuedCurrency | XRP

export interface IssuedCurrencyAmount extends IssuedCurrency {
  value: string
}

export type Amount = IssuedCurrencyAmount | string

export interface Signer {
  Signer: {
    Account: string
    TxnSignature: string
    SigningPubKey: string
  }
}

export interface Memo {
  Memo: {
    MemoData?: string
    MemoType?: string
    MemoFormat?: string
  }
}

export type StreamType =
  | 'consensus'
  | 'ledger'
  | 'manifests'
  | 'peer_status'
  | 'transactions'
  | 'transactions_proposed'
  | 'server'
  | 'validations'

interface PathStep {
  account?: string
  currency?: string
  issuer?: string
}

export type Path = PathStep[]

/**
 * The object that describes the signer in SignerEntries.
 */
export interface SignerEntry {
  /**
   * The object that describes the signer in SignerEntries.
   */
  SignerEntry: {
    /**
     * An XRP Ledger address whose signature contributes to the multi-signature.
     * It does not need to be a funded address in the ledger.
     */
    Account: string
    /**
     * The weight of a signature from this signer.
     * A multi-signature is only valid if the sum weight of the signatures provided meets
     * or exceeds the signer list's SignerQuorum value.
     */
    SignerWeight: number
    /**
     * An arbitrary 256-bit (32-byte) field that can be used to identify the signer, which
     * may be useful for smart contracts, or for identifying who controls a key in a large
     * organization.
     */
    WalletLocator?: string
  }
}

/**
 * This information is added to Transactions in request responses, but is not part
 * of the canonical Transaction information on ledger. These fields are denoted with
 * lowercase letters to indicate this in the rippled responses.
 */
export interface ResponseOnlyTxInfo {
  /**
   * The date/time when this transaction was included in a validated ledger.
   */
  date?: number
  /**
   * An identifying hash value unique to this transaction, as a hex string.
   */
  hash?: string
  /**
   * The sequence number of the ledger that included this transaction.
   */
  ledger_index?: number
}

/**
 * One offer that might be returned from either an {@link NFTBuyOffersRequest}
 * or an {@link NFTSellOffersRequest}.
 *
 * @category Responses
 */
export interface NFTOffer {
  amount: Amount
  flags: number
  nft_offer_index: string
  owner: string
  destination?: string
  expiration?: number
}
