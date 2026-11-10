import { Component, type ReactNode } from 'react';
import { Button } from './ui';

interface Props {
  children: ReactNode;
  /** Al cambiar (por ejemplo, la ruta), se vuelve a intentar mostrar la pantalla. */
  resetKey: string;
}

interface State {
  error: Error | null;
  key: string;
}

/**
 * Si una pantalla falla al mostrarse (o no se pudo cargar su código sin conexión),
 * muestra un mensaje con la opción de reabrir la app, en lugar de dejar la pantalla en blanco.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-6" role="alert">
        <h1 className="text-2xl font-bold">No se pudo abrir esta pantalla</h1>
        <p className="text-lg">
          Puede pasar si se cortó internet justo cuando la app se estaba actualizando. Tus datos
          están guardados.
        </p>
        <p
          className="text-sm break-words text-neutral-600 dark:text-neutral-400"
          data-testid="detalle-error"
        >
          {error.name}: {error.message}
        </p>
        <Button onClick={() => window.location.reload()}>Reabrir la app</Button>
      </div>
    );
  }
}
