'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCard, Wallet, AlertCircle, CheckCircle } from 'lucide-react'
import { useWithdrawal } from '@/hooks/useWithdrawal'

interface WithdrawalModalProps {
  isOpen: boolean
  onClose: () => void
  availableBalance: number
}

export function WithdrawalModal({ isOpen, onClose, availableBalance }: WithdrawalModalProps) {
  const { calculateWithdrawalFee, requestPixWithdrawal, requestCryptoWithdrawal, processingWithdrawal } = useWithdrawal()
  
  const [withdrawalType, setWithdrawalType] = useState<'pix' | 'crypto'>('pix')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<any>(null)
  
  // PIX fields
  const [pixKeyType, setPixKeyType] = useState('email')
  const [pixKey, setPixKey] = useState('')
  
  // Crypto fields
  const [cryptoType, setCryptoType] = useState('USDT_TRC20')
  const [walletAddress, setWalletAddress] = useState('')

  // Calcular taxa quando valor muda
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      const numAmount = parseFloat(amount)
      if (numAmount <= availableBalance) {
        calculateWithdrawalFee(numAmount).then(setFee)
      } else {
        setFee(null)
      }
    } else {
      setFee(null)
    }
  }, [amount, availableBalance])

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      return
    }

    const numAmount = parseFloat(amount)
    
    if (numAmount > availableBalance) {
      return
    }

    let success = false

    if (withdrawalType === 'pix') {
      if (!pixKey) {
        return
      }
      success = await requestPixWithdrawal(numAmount, pixKeyType, pixKey, '', '')
    } else {
      if (!walletAddress) {
        return
      }
      success = await requestCryptoWithdrawal(numAmount, cryptoType, walletAddress)
    }

    if (success) {
      // Reset form
      setAmount('')
      setPixKey('')
      setWalletAddress('')
      setFee(null)
      onClose()
    }
  }

  const isFormValid = () => {
    if (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableBalance) {
      return false
    }

    if (withdrawalType === 'pix') {
      return pixKey
    } else {
      return walletAddress
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SOLICITAR_SAQUE"
      description="Escolha o método e preencha os dados"
      type="info"
    >
      <div className="space-y-6">
        {/* Tipo de Saque */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PIX */}
          <div 
            className={`bg-gray-800/50 border rounded-lg p-4 cursor-pointer transition-all ${
              withdrawalType === 'pix' ? 'border-green-500/50 bg-green-500/10' : 'border-gray-600'
            }`}
            onClick={() => setWithdrawalType('pix')}
          >
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-5 w-5 text-green-400" />
              <span className="font-semibold text-green-400 font-mono text-sm">PIX</span>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Transferência instantânea
            </p>
          </div>

          {/* Crypto */}
          <div 
            className={`bg-gray-800/50 border rounded-lg p-4 cursor-pointer transition-all ${
              withdrawalType === 'crypto' ? 'border-purple-500/50 bg-purple-500/10' : 'border-gray-600'
            }`}
            onClick={() => setWithdrawalType('crypto')}
          >
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="h-5 w-5 text-purple-400" />
              <span className="font-semibold text-purple-400 font-mono text-sm">USDT</span>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Criptomoeda (TRC20/ERC20)
            </p>
          </div>
        </div>

        {/* Valor */}
        <div>
          <Label htmlFor="amount" className="text-white font-mono text-sm mb-2 block">VALOR_SAQUE:</Label>
          <Input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            max={availableBalance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="bg-gray-900/50 border-gray-600 text-white font-mono"
          />
          {parseFloat(amount) > availableBalance && (
            <div className="flex items-center gap-1 mt-1 text-red-400 text-sm">
              <AlertCircle className="h-3 w-3" />
              <span className="font-mono">VALOR_EXCEDE_SALDO</span>
            </div>
          )}
        </div>

        {/* Cálculo da Taxa */}
        {fee && (
          <div className="text-sm font-mono text-gray-400 -mt-2">
            Você receberá: <span className="text-green-400 font-bold">R$ {fee.netAmount.toFixed(2)}</span> <span className="text-gray-500 text-xs">(taxa 2%)</span>
          </div>
        )}

        {/* Campos PIX */}
        {withdrawalType === 'pix' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pix-key-type" className="text-white font-mono text-sm mb-2 block">TIPO_CHAVE:</Label>
              <select
                id="pix-key-type"
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value)}
                className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded text-white font-mono"
              >
                <option value="email">EMAIL</option>
                <option value="phone">TELEFONE</option>
                <option value="cpf">CPF</option>
                <option value="random">ALEATÓRIA</option>
              </select>
            </div>
            
            <div>
              <Label htmlFor="pix-key" className="text-white font-mono text-sm mb-2 block">CHAVE_PIX:</Label>
              <Input
                id="pix-key"
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Digite sua chave PIX"
                className="bg-gray-900/50 border-gray-600 text-white font-mono"
              />
            </div>


          </div>
        )}

        {/* Campos Crypto */}
        {withdrawalType === 'crypto' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="crypto-type" className="text-white font-mono text-sm mb-2 block">TIPO_CRYPTO:</Label>
              <select
                id="crypto-type"
                value={cryptoType}
                onChange={(e) => setCryptoType(e.target.value)}
                className="w-full p-2 bg-gray-900/50 border border-gray-600 rounded text-white font-mono"
              >
                <option value="USDT_TRC20">USDT (TRC20)</option>
                <option value="USDT_ERC20">USDT (ERC20)</option>
              </select>
            </div>

            <div>
              <Label htmlFor="wallet-address" className="text-white font-mono text-sm mb-2 block">ENDEREÇO_CARTEIRA:</Label>
              <Input
                id="wallet-address"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Digite o endereço da carteira"
                className="bg-gray-900/50 border-gray-600 text-white font-mono"
              />
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-400 hover:text-white"
          >
            CANCELAR
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30"
            disabled={!isFormValid() || processingWithdrawal}
          >
            {processingWithdrawal ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                PROCESSANDO...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                SOLICITAR
              </div>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
} 