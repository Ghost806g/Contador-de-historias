using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Contador_de_Historias.Models;

namespace Contador_de_Historias.Services;

public interface ILlmService
{
    Task<string> StreamChatResponseAsync(string contextoRPG, IEnumerable<MensagemChat> historico, Stream responseStream);
}
