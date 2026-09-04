/* Tipos para pwa-kit.js (que es JS plano a propósito: el mismo archivo se copia
   tal cual a los proyectos vanilla, sin build). */
export interface OpcionesNotificaciones {
  motivo?: string
  puedeOfrecerse?: () => boolean
  alActivar?: () => void | Promise<unknown>
}

export interface OpcionesPwaKit {
  nombre: string
  sw?: string | false
  instalar?: boolean
  actualizaciones?: boolean | 'auto'
  notificaciones?: false | OpcionesNotificaciones
}

declare global {
  interface Window {
    initPwaKit: (opciones: OpcionesPwaKit) => void
    pwaKit?: {
      instalada: () => boolean
      pedirNotificaciones: () => Promise<string>
      buscarActualizacion: () => void
    }
  }
}
